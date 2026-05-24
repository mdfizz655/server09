const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://assin09-3.vercel.app', // আপনার Vercel লিঙ্ক
    'http://localhost:3000', 
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser());

// ─── MONGODB CONFIG ───────────────────────────────────────────────────────────
const uri = `mongodb+srv://infomdfizz655_db_user:mustaFIZ360$@cluster0.bwmefix.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let carCollection, bookingCollection, userCollection;

// ডাটাবেস কানেক্ট করার ফাংশন
async function connectDB() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    carCollection = db.collection('cars');
    bookingCollection = db.collection('bookings');
    userCollection = db.collection('users');
    console.log('✅ MongoDB Connected and Collections Ready!');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}
connectDB();

// ─── JWT VERIFY MIDDLEWARE ────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = authHeader?.split(' ')[1] || cookieToken;

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Unauthorized: Invalid token' });
    req.user = decoded;
    next();
  });
};

// ─── AUTH: REGISTER ───────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, photo, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).send({ message: 'Name, email and password are required' });
    }

    const exists = await userCollection.findOne({ email });
    if (exists) return res.status(400).send({ message: 'This email is already registered' });

    const hashed = await bcrypt.hash(password, 12);
    await userCollection.insertOne({
      name, email, photo: photo || '', password: hashed, createdAt: new Date(),
    });

    res.status(201).send({ message: 'Account created successfully' });
  } catch (err) {
    res.status(500).send({ message: 'Registration failed' });
  }
});

// ─── AUTH: LOGIN ──────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userCollection.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).send({ message: 'Invalid credentials or sign in with Google' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send({ message: 'Invalid email or password' });

    const token = jwt.sign({ email: user.email, id: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 60 * 60 * 1000,
    }).send({ user: { _id: user._id, name: user.name, email: user.email, photo: user.photo }, token });
  } catch (err) {
    res.status(500).send({ message: 'Login failed' });
  }
});

// ─── AUTH: GOOGLE & LOGOUT & JWT ─────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  const { name, email, photo } = req.body;
  await userCollection.updateOne({ email }, { $set: { name, email, photo, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  res.send({ message: 'ok' });
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' }).send({ message: 'Logged out' });
});

app.post('/jwt', async (req, res) => {
  const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
  res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 60 * 60 * 1000 }).send({ token });
});

// ─── CARS ROUTES ──────────────────────────────────────────────────────────────
app.get('/cars', async (req, res) => {
  const { search, filter, sort } = req.query;
  let query = {};
  if (search) query.name = { $regex: search, $options: 'i' };
  if (filter && filter !== 'All') query.type = filter;

  let cursor = carCollection.find(query);
  if (sort === 'price_asc') cursor = cursor.sort({ dailyPrice: 1 });
  if (sort === 'price_desc') cursor = cursor.sort({ dailyPrice: -1 });

  const cars = await cursor.toArray();
  res.send(cars);
});

app.get('/cars/:id', async (req, res) => {
  const result = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.post('/cars', verifyToken, async (req, res) => {
  const result = await carCollection.insertOne({ ...req.body, booking_count: 0, createdAt: new Date() });
  res.status(201).send(result);
});

app.get('/my-cars/:email', verifyToken, async (req, res) => {
  if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
  const cars = await carCollection.find({ ownerEmail: req.params.email }).toArray();
  res.send(cars);
});

app.put('/cars/:id', verifyToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { ...req.body, updatedAt: new Date() } };
  const result = await carCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.delete('/cars/:id', verifyToken, async (req, res) => {
  const result = await carCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

// ─── BOOKINGS ROUTES ──────────────────────────────────────────────────────────
app.post('/bookings', verifyToken, async (req, res) => {
  const booking = { ...req.body, userEmail: req.user.email, status: 'Confirmed', createdAt: new Date() };
  const result = await bookingCollection.insertOne(booking);
  await carCollection.updateOne({ _id: new ObjectId(req.body.carId) }, { $inc: { booking_count: 1 } });
  res.status(201).send(result);
});

app.get('/my-bookings/:email', verifyToken, async (req, res) => {
  if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
  const result = await bookingCollection.find({ userEmail: req.params.email }).toArray();
  res.send(result);
});

app.delete('/bookings/:id', verifyToken, async (req, res) => {
  const result = await bookingCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

// Health check
app.get('/', (req, res) => res.send('🚗 DriveFleet API is running ✓'));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));