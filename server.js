import express from 'express';
import cors from 'cors';
import path from 'path';
import iconv from 'iconv-lite';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// База данных URL
const urlDatabase = {
    "авто": [
        "https://www.autonews.ru/",
        "https://www.zr.ru/",
        "https://auto.ru/",
    ],
    "игры": [
        "https://store.steampowered.com/?l=russian",
        "https://stopgame.ru/"
    ],
    "спорт": [
        "https://www.sports.ru/",
        "https://www.championat.com/",
        "https://www.sport-express.ru/"
    ],
    "кино": [
        "https://www.kinopoisk.ru/",
        "https://www.imdb.com/",
        "https://www.film.ru/"
    ],
    "музыка": [
        "https://www.spotify.com/",
        "https://music.yandex.ru/",
        "https://www.apple.com/ru/apple-music/",
        "https://www.billboard.com/"
    ]
};


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/urls', (req, res) => {
    const keyword = req.query.keyword?.toLowerCase().trim();
    
    if (!keyword) {
        return res.status(400).json({ error: 'Ключевое слово не указано.' });
    }

    const foundUrls = [];
    
    Object.keys(urlDatabase).forEach(key => {
        if (key.includes(keyword)) {
            foundUrls.push(...urlDatabase[key]);
        }
    });

    if (foundUrls.length > 0) {
        res.json(foundUrls);
    } else {
        res.status(404).json({ error: `Для ключевого слова '${keyword}' URL не найдены.` });
    }
});

app.get('/api/download', async (req, res) => {
    const urlToFetch = req.query.url;

    if (!urlToFetch) {
        return res.status(400).send('URL для скачивания не указан.');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const response = await fetch(urlToFetch, {
            headers: { 'User-Agent': 'ContentDownloader/1.0' }
        });

        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            throw new Error(`Неподдерживаемый тип контента: ${contentType}. Ожидается HTML.`);
        }

        const contentLength = response.headers.get('content-length');
        const totalSize = contentLength ? parseInt(contentLength) : 0;
        
        sendEvent({ type: 'size', payload: totalSize });

        let downloadedSize = 0;
        const chunks = [];
        
        for await (const chunk of response.body) {
            downloadedSize += chunk.length;
            chunks.push(chunk);
            sendEvent({
                type: 'progress',
                payload: { 
                    loaded: downloadedSize,
                    total: totalSize
                }
            });
        }

        const charsetMatch = contentType.match(/charset=([^;]+)/);
        let encoding = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
        if (!iconv.encodingExists(encoding)) {
            encoding = 'utf-8';
        }

        const buffer = Buffer.concat(chunks);
        const htmlContent = iconv.decode(buffer, encoding);
        
        sendEvent({ type: 'done', payload: htmlContent });

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        sendEvent({ 
            type: 'error', 
            payload: `Не удалось загрузить контент: ${error.message}`
        });
    } finally {
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});