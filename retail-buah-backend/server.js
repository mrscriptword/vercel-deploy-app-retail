const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();

// ================= 1. MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Penanda apakah server berjalan di Vercel atau Lokal
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';

// ================= 2. KONFIGURASI STORAGE (Hybrid) =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

let storage;
if (isVercel) {
  // Gunakan Cloudinary jika di Vercel
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'toko_buah_production',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
  });
  console.log("☁️ Storage: Menggunakan Cloudinary (Production)");
} else {
  // Gunakan Local Disk jika di Laptop
  const uploadDir = 'uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  });
  console.log("💻 Storage: Menggunakan Local Disk (Development)");
}

const upload = multer({ storage: storage });

// ================= 3. MODEL DATABASE =================
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
  nama: { type: String, required: true },
  harga: { type: Number, required: true },
  stok: { type: Number, required: true },
  gambar: { type: String, default: '' } 
}, { timestamps: true }));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  namaBuah: String,
  jumlah: Number,
  totalHarga: Number,
  tanggal: { type: Date, default: Date.now }
}));

// ================= 4. KONEKSI DATABASE & STATUS =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('================================================');
    console.log('✅ DATABASE: Terhubung ke MongoDB Atlas');
    console.log(`🌐 LOKASI: Running on ${isVercel ? 'VERCEL CLOUD' : 'LOCALHOST'}`);
    console.log('================================================');
  })
  .catch((err) => console.error('❌ Gagal Koneksi Database:', err));

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_toko_buah_super_aman';

// Endpoint Cek Status Server (Penanda di Browser)
app.get('/', (req, res) => {
  res.json({
    status: "Server is Running",
    environment: isVercel ? "Vercel Cloud (Production)" : "Local Machine (Development)",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    storage: isVercel ? "Cloudinary Storage" : "Local Disk Storage",
    timestamp: new Date().toISOString()
  });
});

// ================= 5. ROUTES API =================

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User berhasil dibuat" });
  } catch (err) { res.status(400).json({ message: "Username sudah ada" }); }
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- PRODUK ---
app.get('/api/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { nama, harga, stok } = req.body;
    // Logika simpan path/url gambar
    const gambar = req.file ? (isVercel ? req.file.path : req.file.filename) : ''; 
    const newProduct = new Product({ nama, harga: Number(harga), stok: Number(stok), gambar });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { nama, harga, stok } = req.body;
    let updateData = { nama, harga: Number(harga), stok: Number(stok) };
    if (req.file) {
      updateData.gambar = isVercel ? req.file.path : req.file.filename;
    }
    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Produk dihapus" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- TRANSAKSI ---
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

app.post('/api/products/:id/reduce-stock', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product && product.stok >= req.body.quantity) {
      product.stok -= req.body.quantity;
      await product.save();
      res.json({ message: "Stok dikurangi", currentStock: product.stok });
    } else {
      res.status(400).json({ message: "Stok tidak cukup" });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- USER MANAGEMENT ---
app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const updateData = { username, role };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(user);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User dihapus" });
});

// ================= 6. EXPORT / LISTEN =================
if (!isVercel) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
}

module.exports = app;