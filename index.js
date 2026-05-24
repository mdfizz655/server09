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
  origin: function (origin, callback) {
    const allowed = [
      'https://assin09-3.vercel.app',
      'http://localhost:3001',
    ];
    if (!origin) return callback(null, true);
    if (
      allowed.includes(origin) ||
      origin.includes('vercel.app') ||
      origin.includes('netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(null, true); // allow all for now — restrict after deploy
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser());

// ─── MONGODB ──────────────────────────────────────────────────────────────────
const uri = `mongodb+srv://infomdfizz655_db_user:mustaFIZ360$@cluster0.bwmefix.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ─── JWT MIDDLEWARE ───────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  // Check Authorization header first, then cookie
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = authHeader?.split(' ')[1] || cookieToken;

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized: Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// ─── RUN ──────────────────────────────────────────────────────────────────────
async function run() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    const carCollection      = db.collection('cars');
    const bookingCollection  = db.collection('bookings');
    const userCollection     = db.collection('users');

    console.log('✅ MongoDB Connected!');

    // ── AUTH: REGISTER ────────────────────────────────────────────────────────
    app.post('/auth/register', async (req, res) => {
      try {
        const { name, email, photo, password } = req.body;

        if (!name || !email || !password) {
          return res.status(400).send({ message: 'Name, email and password are required' });
        }

        const exists = await userCollection.findOne({ email });
        if (exists) {
          return res.status(400).send({ message: 'This email is already registered' });
        }

        const hashed = await bcrypt.hash(password, 12);
        await userCollection.insertOne({
          name,
          email,
          photo: photo || '',
          password: hashed,
          createdAt: new Date(),
        });

        res.status(201).send({ message: 'Account created successfully' });
      } catch (err) {
        console.error('Register error:', err);
        res.status(500).send({ message: 'Server error. Please try again.' });
      }
    });

    // ── AUTH: LOGIN ───────────────────────────────────────────────────────────
    app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).send({ message: 'Email and password are required' });
        }

        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(401).send({ message: 'Invalid email or password' });
        }

        // Google-only account has no password
        if (!user.password) {
          return res.status(401).send({ message: 'This account uses Google login. Please sign in with Google.' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          return res.status(401).send({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
          { email: user.email, id: user._id },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '10h' }
        );

        // Also set HTTPOnly cookie (JWT with cookies challenge)
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          maxAge: 10 * 60 * 60 * 1000, // 10 hours
        });

        res.send({
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            photo: user.photo,
          },
          token,
        });
      } catch (err) {
        console.error('Login error:', err);
        res.status(500).send({ message: 'Server error. Please try again.' });
      }
    });

    // ── AUTH: GOOGLE UPSERT ───────────────────────────────────────────────────
    app.post('/auth/google', async (req, res) => {
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
        console.error('Google auth error:', err);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // ── AUTH: LOGOUT (clear cookie) ───────────────────────────────────────────
    app.post('/auth/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      });
      res.send({ message: 'Logged out' });
    });

    // ── JWT (for Google login token generation) ───────────────────────────────
    app.post('/jwt', async (req, res) => {
      try {
        const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          maxAge: 10 * 60 * 60 * 1000,
        });

        res.send({ token });
      } catch (err) {
        res.status(500).send({ message: 'Token generation failed' });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CARS
    // ─────────────────────────────────────────────────────────────────────────

    // GET all cars — public, with search + filter
    app.get('/cars', async (req, res) => {
      try {
        const { search, filter, sort } = req.query;
        let query = {};

        if (search && search.trim()) {
          query.name = { $regex: search.trim(), $options: 'i' };
        }
        if (filter && filter !== 'All') {
          query.type = filter;
        }

        let cursor = carCollection.find(query);

        if (sort === 'price_asc')  cursor = cursor.sort({ dailyPrice: 1 });
        if (sort === 'price_desc') cursor = cursor.sort({ dailyPrice: -1 });
        if (sort === 'newest')     cursor = cursor.sort({ _id: -1 });

        const cars = await cursor.toArray();
        res.send(cars);
      } catch (err) {
        console.error('GET /cars error:', err);
        res.status(500).send({ message: 'Failed to fetch cars' });
      }
    });

    // GET single car — public
    app.get('/cars/:id', async (req, res) => {
      try {
        const result = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!result) return res.status(404).send({ message: 'Car not found' });
        res.send(result);
      } catch {
        res.status(400).send({ message: 'Invalid car ID' });
      }
    });

    // POST add car — private
    app.post('/cars', verifyToken, async (req, res) => {
      try {
        const carData = {
          ...req.body,
          booking_count: 0,
          availability: req.body.availability || 'Available',
          createdAt: new Date(),
        };
        const result = await carCollection.insertOne(carData);
        res.status(201).send(result);
      } catch (err) {
        console.error('POST /cars error:', err);
        res.status(500).send({ message: 'Failed to add car' });
      }
    });

    // GET my listed cars — private
    app.get('/my-cars/:email', verifyToken, async (req, res) => {
      try {
        // Owner can only see their own cars
        if (req.user.email !== req.params.email) {
          return res.status(403).send({ message: 'Forbidden' });
        }
        const cars = await carCollection
          .find({ ownerEmail: req.params.email })
          .sort({ _id: -1 })
          .toArray();
        res.send(cars);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch your cars' });
      }
    });

    // PUT update car — private (owner only)
    app.put('/cars/:id', verifyToken, async (req, res) => {
      try {
        const car = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!car) return res.status(404).send({ message: 'Car not found' });
        if (car.ownerEmail !== req.user.email) {
          return res.status(403).send({ message: 'Forbidden: Not your car' });
        }

        const updatedFields = { ...req.body };
        delete updatedFields._id; // prevent _id update

        const result = await carCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { ...updatedFields, updatedAt: new Date() } }
        );
        res.send(result);
      } catch (err) {
        console.error('PUT /cars/:id error:', err);
        res.status(500).send({ message: 'Failed to update car' });
      }
    });

    // DELETE car — private (owner only)
    app.delete('/cars/:id', verifyToken, async (req, res) => {
      try {
        const car = await carCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!car) return res.status(404).send({ message: 'Car not found' });
        if (car.ownerEmail !== req.user.email) {
          return res.status(403).send({ message: 'Forbidden: Not your car' });
        }
        const result = await carCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to delete car' });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // BOOKINGS
    // ─────────────────────────────────────────────────────────────────────────

    // POST book a car — private
    app.post('/bookings', verifyToken, async (req, res) => {
      try {
        const bookingData = {
          ...req.body,
          userEmail: req.user.email,
          status: 'Confirmed',
          createdAt: new Date(),
          bookingDate: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        };

        const result = await bookingCollection.insertOne(bookingData);

        // Increase booking_count using $inc (requirement)
        await carCollection.updateOne(
          { _id: new ObjectId(req.body.carId) },
          { $inc: { booking_count: 1 } }
        );

        res.status(201).send(result);
      } catch (err) {
        console.error('POST /bookings error:', err);
        res.status(500).send({ message: 'Booking failed. Please try again.' });
      }
    });

    // GET my bookings — private
    app.get('/my-bookings/:email', verifyToken, async (req, res) => {
      try {
        if (req.user.email !== req.params.email) {
          return res.status(403).send({ message: 'Forbidden' });
        }
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
    app.delete('/bookings/:id', verifyToken, async (req, res) => {
      try {
        const booking = await bookingCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!booking) return res.status(404).send({ message: 'Booking not found' });
        if (booking.userEmail !== req.user.email) {
          return res.status(403).send({ message: 'Forbidden' });
        }
        const result = await bookingCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to cancel booking' });
      }
    });

  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }
}

run().catch(console.dir);

// Health check
app.get('/', (req, res) => {
  res.send('🚗 DriveFleet API is running ✓');
});

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
