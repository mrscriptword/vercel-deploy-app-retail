const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();

// ================= 1. MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= 2. KONFIGURASI CLOUDINARY =================
// Data diambil dari Environment Variables (Vercel)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produk_buah',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
  },
});
const upload = multer({ storage: storage });

// ================= 3. DATABASE MODELS =================
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
  nama: { type: String, required: true },
  harga: { type: Number, required: true },
  stok: { type: Number, required: true },
  gambar: { type: String, default: '' } // Akan menyimpan URL HTTPS dari Cloudinary
}, { timestamps: true }));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  productId: mongoose.Schema.Types.ObjectId,
  namaBuah: String,
  jumlah: Number,
  totalHarga: Number,
  tanggal: { type: Date, default: Date.now }
}));

// ================= 4. KONEKSI MONGODB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Terhubung ke MongoDB Atlas'))
  .catch((err) => console.error('❌ Gagal Koneksi:', err));

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_aman';

// ================= 5. ROUTES =================

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User berhasil dibuat" });
  } catch (err) {
    res.status(400).json({ message: "Username sudah ada" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
      const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
      res.json({ token, role: user.role, username: user.username });
    } else {
      res.status(401).json({ message: "Username/Password Salah" });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- PRODUK ---
app.get('/api/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { nama, harga, stok } = req.body;
    // req.file.path berisi URL Cloudinary (https://res.cloudinary.com/...)
    const gambar = req.file ? req.file.path : ''; 

    const newProduct = new Product({ nama, harga: Number(harga), stok: Number(stok), gambar });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { nama, harga, stok } = req.body;
    let updateData = { nama, harga: Number(harga), stok: Number(stok) };

    if (req.file) {
      updateData.gambar = req.file.path;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Produk dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- TRANSAKSI & USER MANAGEMENT (Sama seperti sebelumnya) ---
app.post('/api/transactions', async (req, res) => {
  try {
    const trx = new Transaction(req.body);
    await trx.save();
    res.status(201).json(trx);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/transactions', async (req, res) => {
  const trxs = await Transaction.find().sort({ tanggal: -1 });
  res.json(trxs);
});

app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User dihapus" });
});

// ================= 6. EXPORT UNTUK VERCEL =================
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
}

module.exports = app;
