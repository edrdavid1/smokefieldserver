const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();


app.use(cors());
const dbUri = process.env.MONGODB_URI;


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер працуе на порце ${PORT}`);
});


// Мадэль карыстальніка
const userSchema = new mongoose.Schema({
    name: String,
    uniqecode: { type: String, unique: true, required: true },
    password: String,
    confirmed: Boolean,
    currentNum: Number,
    totalNum: Number,
});

const User = mongoose.model('User', userSchema);

// Падключэнне да базы дадзеных
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mydb', {
    serverSelectionTimeoutMS: 30000,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Error connecting to MongoDB:', err));

// HTTP і WebSocket серверы
const server = http.createServer();
const wss = new WebSocket.Server({ server });

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

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер працуе на порце ${PORT}`);
});


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
    const { userGG, userBB } = req.body;
    console.log('Received:', { userGG, userBB });

    if(userGG != userBB){
    try {
        const userBBData = await User.findOne({ uniqecode: userBB });
        const userGGData = await User.findOne({ uniqecode: userGG });

        if (userBBData && userGGData) {
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
} else{
    res.status(923).json({ message: 'Ты не можаш страляць у самога сябе' });
}
});

app.post('/register', async (req, res) => {
    const { username, password, name } = req.body;

    const currentNum = 0;
    const totalNum = 0; 

    if (!username || !password || !name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ uniqecode: username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            uniqecode: username,
            password: hashedPassword,
            confirmed: true,
            currentNum,
            totalNum
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ uniqecode: username });
        if (!user) {
            return res.status(400).json({ message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password.' });
        }

        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

