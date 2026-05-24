const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    if (
      !origin ||
      origin.includes('localhost') ||
      origin.includes('vercel.app') ||
      origin.includes('netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser());

// ─── MONGODB ──────────────────────────────────────────────────────────────────
const uri = `mongodb+srv://infomdfizz655_db_user:aUclIK10jTy1JH4T@cluster0.hzy45ka.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let carCollection, bookingCollection, userCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    carCollection     = db.collection('cars');
    bookingCollection = db.collection('bookings');
    userCollection    = db.collection('users');
    console.log('✅ MongoDB Connected!');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
}
connectDB();

// ─── VERIFY TOKEN ─────────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token =
    req.headers.authorization?.split(' ')[1] ||
    req.cookies?.token;

  if (!token) return res.status(401).send({ message: 'Unauthorized: no token' });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secret', (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Unauthorized: invalid token' });
    req.user = decoded;
    next();
  });
};

// ─── DB READY CHECK ───────────────────────────────────────────────────────────
const dbReady = (req, res, next) => {
  if (!carCollection) return res.status(503).send({ message: 'DB not ready' });
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Register
app.post('/auth/register', dbReady, async (req, res) => {
  try {
    const { name, email, photo, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).send({ message: 'Name, email and password required' });

    const exists = await userCollection.findOne({ email });
    if (exists) return res.status(400).send({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    await userCollection.insertOne({
      name, email,
      photo: photo || '',
      password: hashed,
      createdAt: new Date(),
    });
    res.status(201).send({ message: 'Registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).send({ message: 'Server error' });
  }
});

// Login
app.post('/auth/login', dbReady, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).send({ message: 'Email and password required' });

    const user = await userCollection.findOne({ email });
    if (!user) return res.status(401).send({ message: 'Invalid email or password' });

    if (!user.password)
      return res.status(401).send({ message: 'Please sign in with Google' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { email: user.email, id: user._id },
      process.env.ACCESS_TOKEN_SECRET || 'secret',
      { expiresIn: '10h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 10 * 60 * 60 * 1000,
    });

    res.send({
      user: { _id: user._id, name: user.name, email: user.email, photo: user.photo },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send({ message: 'Server error' });
  }
});

// Google upsert
app.post('/auth/google', dbReady, async (req, res) => {
  try {
    const { name, email, photo } = req.body;
    if (!email) return res.status(400).send({ message: 'Email required' });

    await userCollection.updateOne(
      { email },
      {
        $set: { name, email, photo: photo || '', updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    res.send({ message: 'ok' });
  } catch (err) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  });
  res.send({ message: 'Logged out' });
});

// JWT (Google login token generation)
app.post('/jwt', dbReady, async (req, res) => {
  try {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET || 'secret', { expiresIn: '10h' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 10 * 60 * 60 * 1000,
    });
    res.send({ token });
  } catch (err) {
    res.status(500).send({ message: 'Token error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CARS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET all cars — public — search + filter + sort
app.get('/cars', dbReady, async (req, res) => {
  try {
    const { search, filter, sort } = req.query;
    let query = {};

    if (search && search.trim())
      query.name = { $regex: search.trim(), $options: 'i' };

    if (filter && filter !== 'All')
      query.type = filter;

    let cursor = carCollection.find(query);
    if (sort === 'price_asc')  cursor = cursor.sort({ dailyPrice: 1 });
    if (sort === 'price_desc') cursor = cursor.sort({ dailyPrice: -1 });
    if (sort === 'newest')     cursor = cursor.sort({ _id: -1 });

    res.send(await cursor.toArray());
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch cars' });
  }
});

// GET single car — public
app.get('/cars/:id', dbReady, async (req, res) => {
  try {
    const result = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).send({ message: 'Car not found' });
    res.send(result);
  } catch {
    res.status(400).send({ message: 'Invalid car ID' });
  }
});

// POST add car — private
app.post('/cars', dbReady, verifyToken, async (req, res) => {
  try {
    const carData = {
      ...req.body,
      booking_count: Number(req.body.booking_count) || 0,
      availability: req.body.availability || 'Available',
      createdAt: new Date(),
    };
    const result = await carCollection.insertOne(carData);
    res.status(201).send(result);
  } catch (err) {
    console.error('Add car error:', err);
    res.status(500).send({ message: 'Failed to add car' });
  }
});

// GET my cars — private
app.get('/my-cars/:email', dbReady, verifyToken, async (req, res) => {
  try {
    if (req.user.email !== req.params.email)
      return res.status(403).send({ message: 'Forbidden' });

    const cars = await carCollection
      .find({ ownerEmail: req.params.email })
      .sort({ _id: -1 })
      .toArray();
    res.send(cars);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch your cars' });
  }
});

// PUT update car — private
app.put('/cars/:id', dbReady, verifyToken, async (req, res) => {
  try {
    const car = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).send({ message: 'Car not found' });
    if (car.ownerEmail !== req.user.email)
      return res.status(403).send({ message: 'Forbidden' });

    const fields = { ...req.body };
    delete fields._id;

    const result = await carCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...fields, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (err) {
    console.error('Update car error:', err);
    res.status(500).send({ message: 'Failed to update car' });
  }
});

// DELETE car — private
app.delete('/cars/:id', dbReady, verifyToken, async (req, res) => {
  try {
    const car = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!car) return res.status(404).send({ message: 'Car not found' });
    if (car.ownerEmail !== req.user.email)
      return res.status(403).send({ message: 'Forbidden' });

    const result = await carCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to delete car' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKINGS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST book a car — private
app.post('/bookings', dbReady, verifyToken, async (req, res) => {
  try {
    const bookingData = {
      ...req.body,
      userEmail: req.user.email,
      status: 'Confirmed',
      createdAt: new Date(),
      bookingDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
    };

    const result = await bookingCollection.insertOne(bookingData);

    // $inc booking_count (requirement)
    if (req.body.carId) {
      await carCollection.updateOne(
        { _id: new ObjectId(req.body.carId) },
        { $inc: { booking_count: 1 } }
      );
    }

    res.status(201).send(result);
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).send({ message: 'Booking failed' });
  }
});

// GET my bookings — private
app.get('/my-bookings/:email', dbReady, verifyToken, async (req, res) => {
  try {
    if (req.user.email !== req.params.email)
      return res.status(403).send({ message: 'Forbidden' });

    const bookings = await bookingCollection
      .find({ userEmail: req.params.email })
      .sort({ _id: -1 })
      .toArray();
    res.send(bookings);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch bookings' });
  }
});

// DELETE booking — private (cancel)
app.delete('/bookings/:id', dbReady, verifyToken, async (req, res) => {
  try {
    const booking = await bookingCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!booking) return res.status(404).send({ message: 'Booking not found' });
    if (booking.userEmail !== req.user.email)
      return res.status(403).send({ message: 'Forbidden' });

    const result = await bookingCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to cancel booking' });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('🚗 DriveFleet API Running ✓'));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
