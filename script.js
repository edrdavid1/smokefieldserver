const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,  
      pass: process.env.GMAIL_PASS   
    }
  });  


  function sendConfirmationEmail(email, confirmationCode) {
    const mailOptions = {
        from: 'smokefieldbot1@gmail.com',  // Ваш адрас Gmail
        to: email,                     // Адрас атрымальніка
        subject: 'Email confirmation',  // Тэма ліста
        text: `Ваш код: ${confirmationCode}`  // Тэкст ліста
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Памылка пры адпраўцы ліста:', error);
        } else {
            console.log('Ліст адпраўлены:', info.response);
        }
    });
}

  function generateConfirmationCode() {
    return Math.floor(100000 + Math.random() * 900000);
  }
  

  






dotenv.config();

const app = express();

app.use(cors());
const dbUri = process.env.MONGODB_URI;

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const http = require('http');
const WebSocket = require('ws');

// Стварыце HTTP-сервер перад яго запускам
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Сервер працуе на порце ${PORT}`);
});

// Мадэль карыстальніка
const userSchema = new mongoose.Schema({
    name: String,
    uniqecode: { type: String, unique: true, required: true },
    password: String,
    email: String,
    confirmed: Boolean,
    currentNum: Number,
    totalNum: Number,
    confirmationCode: String,
});

const User = mongoose.model('User', userSchema);

// Падключэнне да базы дадзеных
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mydb', {
    serverSelectionTimeoutMS: 30000,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Error connecting to MongoDB:', err));

// WebSocket апрацоўка
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('Новы кліент падключаны.');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        if (data.type === 'register') {
            clients.set(data.userId, ws);
            console.log(`Карыстальнік зарэгістраваны: ${data.userId}`);
        } else if (data.type === 'sendCig') {
            const { userGG, cig } = data;

            try {
                const recipient = await User.findOne({ uniqecode: userGG });
                if (!recipient) {
                    console.error(`Карыстальнік ${userGG} не знойдзены.`);
                    ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
                    return;
                }

                const recipientSocket = clients.get(userGG);
                if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
                    recipientSocket.send(JSON.stringify({ cig }));
                    console.log(`Cig: ${cig} адпраўлены карыстальніку: ${userGG}`);
                } else {
                    console.error(`Карыстальнік ${userGG} не падключаны.`);
                    ws.send(JSON.stringify({ type: 'error', message: `Recipient ${userGG} not connected` }));
                }
            } catch (error) {
                console.error('Памылка апрацоўкі:', error.message, error.stack);
                ws.send(JSON.stringify({ type: 'error', message: 'Server error' }));
            }
        } else {
            console.warn(`Невядомы тып паведамлення: ${data.type}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
    });

    ws.on('close', () => {
        for (let [userId, socket] of clients.entries()) {
            if (socket === ws) {
                clients.delete(userId);
                console.log(`Карыстальнік ${userId} адключыўся.`);
                break;
            }
        }
    });
});



app.post('/confirm-email', async (req, res) => {
    const { email, confirmationCode } = req.body;

    try {
        // Дастаем карыстальніка па email
        const user = await User.findOne({ email });

        // Правяраем, ці знойдзены карыстальнік
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Параўноўваем код з базы з тым, што прыйшоў у запыце
        if (user.confirmationCode !== confirmationCode) {
            return res.status(400).json({ message: 'Invalid confirmation code.' });
        }

        // Дадатковая праверка: ці ўжо пацверджаны email
        if (user.confirmed) {
            return res.status(400).json({ message: 'Email already confirmed.' });
        }

        // Абнаўляем статус карыстальніка ў базе
        user.confirmed = true;
        await user.save();

        res.status(200).json({ message: 'Email confirmed successfully!' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// HTTP маршруты
app.get('/userdata/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await User.findOne({ uniqecode: username });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.post('/updateuser', async (req, res) => {
    // Зводзім userGG і userBB да ніжняга рэгістру
    const userGG = req.body.userGG.toLowerCase();
    const userBB = req.body.userBB.toLowerCase();

    console.log('Received:', { userGG, userBB });

    if (userGG !== userBB) {
        try {
            // Шуканне карыстальнікаў у базе дадзеных
            const userBBData = await User.findOne({ uniqecode: userBB });
            const userGGData = await User.findOne({ uniqecode: userGG });

            if (userBBData && userGGData) {
                // Абнаўленне дадзеных карыстальнікаў
                userBBData.currentNum -= 1;
                userGGData.totalNum += 1;
                userGGData.currentNum += 1;

                await userBBData.save();
                await userGGData.save();

                res.json({ success: true, userBBData, userGGData });
            } else {
                res.status(404).json({ success: false, message: 'User not found' });
            }
        } catch (error) {
            console.error('Error updating user data:', error);
            res.status(500).json({ message: 'Server error.' });
        }
    } else {
        res.status(400).json({ message: 'Ты не можаш страляць у самога сябе' });
    }
});


const { body, validationResult } = require('express-validator');

app.post('/register', async (req, res) => {
    const { username, password, name, email } = req.body;

    // Зводзім username і email да ніжняга рэгістру
    const normalizedUsername = username.toLowerCase();
    const normalizedEmail = email.toLowerCase();

    const confirmationCode = generateConfirmationCode(); // Генерацыя кода

    try {
        // Правяраем, ці ўжо існуе карыстальнік з такім username
        const existingUser = await User.findOne({ uniqecode: normalizedUsername });
        if (existingUser) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        // Хэшаванне пароля
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Стварэнне новага карыстальніка
        const newUser = new User({
            name,
            uniqecode: normalizedUsername, // Захоўваем username у ніжнім рэгістры
            email: normalizedEmail,         // Захоўваем email у ніжнім рэгістры
            password: hashedPassword,
            confirmed: false,
            confirmationCode,               // Дадаем код пацверджання
            currentNum: 0,
            totalNum: 0,
        });

        await newUser.save();

        // Адпраўляем код пацверджання на пошту
        sendConfirmationEmail(normalizedEmail, confirmationCode);

        res.status(201).json({ message: 'User registered successfully. Please check your email to confirm your account.' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Зводзім username да ніжняга рэгістру
        const normalizedUsername = username.toLowerCase();

        // Пошук карыстальніка па зводзеным да ніжняга рэгістру uniqecode
        const user = await User.findOne({ uniqecode: normalizedUsername });
        if (!user) {
            return res.status(400).json({ message: 'User not found.' });
        }

        // Праверка пароля
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password.' });
        }

        // Генерацыя токена
        const token = jwt.sign({ username: user.uniqecode }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

