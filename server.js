// server.js

// ---------------------------
// 1. Module Imports (นำเข้าโมดูลที่จำเป็น)
// ---------------------------
require('dotenv').config(); // โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env
const express = require('express'); // Framework สำหรับสร้างเว็บแอปพลิเคชัน
const { Pool } = require('pg'); // เชื่อมต่อกับ PostgreSQL Database
const cors = require = require('cors'); // จัดการ Cross-Origin Resource Sharing (CORS) สำหรับการสื่อสารระหว่าง Frontend/Backend

const app = express(); // สร้าง Instance ของ Express App
const port = process.env.PORT || 3000; // กำหนด Port ให้ Server รัน (ใช้ Port จาก .env หรือ 3000 เป็นค่าเริ่มต้น)

// ---------------------------
// 2. Middleware Setup (ตั้งค่า Middleware)
// ---------------------------
app.use(cors()); // เปิดใช้งาน CORS สำหรับทุก requests
app.use(express.json()); // Middleware สำหรับ Parse JSON Body จาก requests (เช่น POST, PUT)
app.use(express.static('public')); // กำหนดให้ Serve ไฟล์ Static จาก Folder 'public' (สำหรับ Frontend)

// ---------------------------
// 3. Database Connection Pool (ตั้งค่าการเชื่อมต่อฐานข้อมูล)
// ---------------------------
// ใช้ DATABASE_URL จากตัวแปรสภาพแวดล้อมของ Render.com หรือ .env file
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // ใช้ Connection String โดยตรง
    ssl: {
        rejectUnauthorized: false // จำเป็นสำหรับ Render.com เมื่อเชื่อมต่อผ่าน SSL
    }
});

// ตรวจสอบการเชื่อมต่อ Database
pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database!');
});

pool.on('error', (err) => {
    console.error('Error connecting to the database:', err);
});

// ---------------------------
// 4. API Endpoints (กำหนด Endpoint ของ API)
// ---------------------------

// 4.1. GET /api/notes: ดึงโน้ตทั้งหมด (หรือกรองตามวันที่/ผู้ใช้ในอนาคต)
app.get('/api/notes', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, date_key AS date, note_content AS text, user_name FROM notes ORDER BY date_key, id');
        res.json(result.rows); // ส่งข้อมูลโน้ตทั้งหมดกลับไปในรูปแบบ JSON
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// 4.2. POST /api/notes: เพิ่มโน้ตใหม่
app.post('/api/notes', async (req, res) => {
    const { date, text, user_name } = req.body; // รับ date, text, user_name จาก Body ของ Request
    // ตรวจสอบข้อมูลที่จำเป็น
    if (!date || !text || !user_name) {
        return res.status(400).json({ message: 'Date, text, and user_name are required.' });
    }
    try {
        // ใช้ DEFAULT gen_random_uuid() สำหรับ id, ไม่ต้องใส่ใน INSERT
        const result = await pool.query(
            'INSERT INTO notes (date_key, note_content, user_name) VALUES ($1, $2, $3) RETURNING id, date_key AS date, note_content AS text, user_name',
            [date, text, user_name] // ค่าที่ส่งไปใน Query
        );
        res.status(201).json(result.rows[0]); // ส่งโน้ตที่เพิ่มใหม่กลับไปพร้อม ID ที่ถูกสร้าง
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// 4.3. PUT /api/notes/:id: แก้ไขโน้ตที่มีอยู่ (ตรวจสอบสิทธิ์ผู้ใช้)
app.put('/api/notes/:id', async (req, res) => {
    const { id } = req.params; // รับ ID ของโน้ตจาก URL Parameter
    const { text, user_name } = req.body; // รับ text ใหม่และ user_name จาก Body ของ Request
    
    // ตรวจสอบข้อมูลที่จำเป็น
    if (!text || !user_name) {
        return res.status(400).json({ message: 'Text and user_name are required for update.' });
    }

    try {
        // ก่อนอัปเดต: ตรวจสอบว่าโน้ตนั้นเป็นของผู้ใช้คนนี้หรือไม่
        const checkOwnership = await pool.query('SELECT user_name FROM notes WHERE id = $1', [id]);
        if (checkOwnership.rows.length === 0) {
            return res.status(404).json({ message: 'Note not found.' });
        }
        if (checkOwnership.rows[0].user_name !== user_name) {
            return res.status(403).json({ message: 'Forbidden: You do not own this note.' }); // ถ้าไม่ใช่เจ้าของ
        }

        // ถ้าเป็นเจ้าของ ให้อัปเดตได้
        const result = await pool.query(
            'UPDATE notes SET note_content = $1 WHERE id = $2 RETURNING id, date_key AS date, note_content AS text, user_name',
            [text, id] // อัปเดตเฉพาะ note_content
        );
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]); // ส่งโน้ตที่อัปเดตแล้วกลับไป
        } else {
            res.status(404).json({ message: 'Note not found.' });
        }
    } catch (err) {
        console.error('Error updating note:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// 4.4. DELETE /api/notes/:id: ลบโน้ต (ตรวจสอบสิทธิ์ผู้ใช้)
app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params; // รับ ID ของโน้ตจาก URL Parameter
    const { user_name } = req.body; // รับ user_name จาก Body ของ Request

    if (!user_name) {
        return res.status(400).json({ message: 'User name is required for deletion.' });
    }

    try {
        // ก่อนลบ: ตรวจสอบว่าโน้ตนั้นเป็นของผู้ใช้คนนี้หรือไม่
        const checkOwnership = await pool.query('SELECT user_name FROM notes WHERE id = $1', [id]);
        if (checkOwnership.rows.length === 0) {
            return res.status(404).json({ message: 'Note not found.' });
        }
        if (checkOwnership.rows[0].user_name !== user_name) {
            return res.status(403).json({ message: 'Forbidden: You do not own this note.' }); // ถ้าไม่ใช่เจ้าของ
        }

        // ถ้าเป็นเจ้าของ ให้ลบได้
        const result = await pool.query('DELETE FROM notes WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Note deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Note not found.' });
        }
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// ---------------------------
// 5. Start Server (เริ่มทำงาน Server)
// ---------------------------
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Open your browser at http://localhost:${port}`);
});