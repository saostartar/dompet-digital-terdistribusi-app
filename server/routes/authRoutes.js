import express from 'express';
import { register, login } from '../controllers/authController.js';

const router = express.Router();

// Rute untuk Registrasi Pengguna
// POST /api/auth/register
router.post('/register', register);

// Rute untuk Login Pengguna
// POST /api/auth/login
router.post('/login', login);

export default router;
