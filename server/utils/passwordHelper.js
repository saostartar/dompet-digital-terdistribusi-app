import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10; // Jumlah salt rounds, semakin tinggi semakin aman tapi lambat

/**
 * Melakukan hashing pada password.
 * @param {string} plainPassword Password teks biasa.
 * @returns {Promise<string>} Hash password.
 */
export const hashPassword = async (plainPassword) => {
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);
        return hashedPassword;
    } catch (error) {
        console.error('Error saat hashing password:', error);
        throw new Error('Gagal melakukan hashing password.');
    }
};

/**
 * Membandingkan password teks biasa dengan hash password.
 * @param {string} plainPassword Password teks biasa yang diinput pengguna.
 * @param {string} hashedPassword Hash password yang tersimpan di database.
 * @returns {Promise<boolean>} True jika password cocok, false jika tidak.
 */
export const comparePassword = async (plainPassword, hashedPassword) => {
    try {
        const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
        return isMatch;
    } catch (error) {
        console.error('Error saat membandingkan password:', error);
        throw new Error('Gagal membandingkan password.');
    }
};
