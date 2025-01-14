const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// Дазваляем CORS
app.use(cors());

// Дадаём падтрымку JSON
app.use(express.json());

// Чытанне і запіс у файл
function readDatabase() {
    const data = fs.readFileSync('db.json', 'utf-8');
    return JSON.parse(data);
}

function writeDatabase(data) {
    fs.writeFileSync('db.json', JSON.stringify(data, null, 2));
}

// Маршрут для атрымання дадзеных карыстальнікаў
app.get('/userdata/:username', (req, res) => {
    const { username } = req.params;

    try {
        const db = readDatabase();
        const user = db.users.find(u => u.uniqecode === username);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});


// Маршрут для абнаўлення дадзеных карыстальніка
app.post('/updateuser', (req, res) => {
    const { userGG, userBB } = req.body;
    console.log('Received:', { userGG, userBB });  // Лаг для праверкі атрыманых дадзеных

    const db = readDatabase();

    const userBBData = db.users.find(u => u.uniqecode === userBB);
    const userGGData = db.users.find(u => u.uniqecode === userGG);

    console.log('userBBData:', userBBData);  // Лаг для карыстальніка userBB
    console.log('userGGData:', userGGData);  // Лаг для карыстальніка userGG

    if (userBBData && userGGData) {
        userBBData.currentNum -= 1;
        userGGData.totalNum += 1;
        userGGData.currentNum += 1;

        writeDatabase(db);

        res.json({ success: true, userBBData, userGGData });
    } else {
        res.status(404).json({ success: false, message: 'Карыстальнік не знойдзены' });
    }
});




app.post('/register', async (req, res) => {
    const { username, password, name } = req.body;  // Дадаем name

    // Усталёўка значэнняў па змаўчанні для currentNum і totalNum
    const currentNum = 0; // Напрыклад, пачатковая нумарацыя карыстальніка
    const totalNum = 100; // Можа быць па змаўчанні ці вылічана з іншых дадзеных

    if (!username || !password || !name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const db = readDatabase();

        // Праверка, ці існуе карыстальнік з такім юзернэймам
        const existingUser = db.users.find(user => user.uniqecode === username);
        if (existingUser) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        // Хэшырванне пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Дадаем новага карыстальніка ў базу
        const newUser = {
            name,              // Дадаем name
            uniqecode: username,
            password: hashedPassword,
            confirmed: true,   // Паўторна выкарыстоўваем confirmed = true
            currentNum,        // Новыя значэнні па змаўчанні
            totalNum           // Новыя значэнні па змаўчанні
        };

        db.users.push(newUser);
        writeDatabase(db);

        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});



app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const db = readDatabase();

        // Праверка: ці існуе карыстальнік
        const user = db.users.find(user => user.uniqecode === username);
        if (!user) {
            return res.status(400).json({ message: 'User not found.' });
        }

        // Праверка пароля
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password.' });
        }

        // Стварэнне токена
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });
    } catch (error) {
        console.error('Error logging in:', error); // Дадаем лаг для прагляду памылак
        res.status(500).json({ message: 'Server error.' });
    }
});


// Запуск сервера на порце 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запушчаны на порце ${PORT}`);
});
