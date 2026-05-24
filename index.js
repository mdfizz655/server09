const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors({
  origin: ['https://assin09-3.vercel.app', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://infomdfizz655_db_user:aUclIK10jTy1JH4T@cluster0.hzy45ka.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let carCollection, bookingCollection, userCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    carCollection = db.collection('cars');
    bookingCollection = db.collection('bookings');
    userCollection = db.collection('users');
    console.log("✅ MongoDB Connected!");

    // --- JWT Token & Cookie ---
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
      res.cookie('token', token, {
        httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 60 * 60 * 1000
      }).send({ success: true });
    });

    app.post('/logout', (req, res) => {
      res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' }).send({ success: true });
    });

    // --- Auth: Register ---
    app.post('/auth/register', async (req, res) => {
      const { name, email, photo, password } = req.body;
      const hashed = await bcrypt.hash(password, 12);
      await userCollection.insertOne({ name, email, photo, password: hashed, createdAt: new Date() });
      res.status(201).send({ message: 'User Registered' });
    });

    // --- Cars: Search & Filter (Challenge Requirement) ---
    app.get('/cars', async (req, res) => {
      const { search, filter } = req.query;
      let query = {};
      if (search) query.name = { $regex: search, $options: 'i' }; // Regex Search
      if (filter && filter !== 'All') query.type = filter; // Type Filter
      const result = await carCollection.find(query).toArray();
      res.send(result);
    });

    // --- Booking: $inc Requirement (Challenge Requirement) ---
    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      // Increase booking_count using $inc
      await carCollection.updateOne(
        { _id: new ObjectId(booking.carId) },
        { $inc: { booking_count: 1 } }
      );
      res.send(result);
    });

    // --- My Bookings ---
    app.get('/my-bookings/:email', async (req, res) => {
      const result = await bookingCollection.find({ userEmail: req.params.email }).toArray();
      res.send(result);
    });

    // --- Delete Car (Confirmation handled in Frontend) ---
    app.delete('/cars/:id', async (req, res) => {
      const result = await carCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

  } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('🚗 DriveFleet API Live'));
app.listen(port);