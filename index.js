const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/albums.json';
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/data/uploads';

// Ensure directories exist
if (!fs.existsSync('/data')) {
  fs.mkdirSync('/data', { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize database
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ albums: [] }, null, 2));
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper functions
function readDatabase() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { albums: [] };
  }
}

function writeDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Photo Album API is running' });
});

// Create new album
app.post('/api/albums', (req, res) => {
  try {
    const { name, creatorName } = req.body;
    
    if (!name || !creatorName) {
      return res.status(400).json({ error: 'Album name and creator name are required' });
    }

    const db = readDatabase();
    const album = {
      id: uuidv4(),
      name,
      creatorName,
      shareLink: uuidv4(),
      photos: [],
      createdAt: new Date().toISOString()
    };

    db.albums.push(album);
    writeDatabase(db);

    res.status(201).json(album);
  } catch (error) {
    console.error('Error creating album:', error);
    res.status(500).json({ error: 'Failed to create album' });
  }
});

// Get all albums for a user
app.get('/api/albums', (req, res) => {
  try {
    const { creatorName } = req.query;
    const db = readDatabase();
    
    if (creatorName) {
      const userAlbums = db.albums.filter(album => album.creatorName === creatorName);
      res.json(userAlbums);
    } else {
      res.json(db.albums);
    }
  } catch (error) {
    console.error('Error fetching albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Get album by share link
app.get('/api/albums/share/:shareLink', (req, res) => {
  try {
    const { shareLink } = req.params;
    const db = readDatabase();
    const album = db.albums.find(a => a.shareLink === shareLink);
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    
    res.json(album);
  } catch (error) {
    console.error('Error fetching album by share link:', error);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// Upload photo to album
app.post('/api/albums/:shareLink/photos', upload.single('photo'), (req, res) => {
  try {
    const { shareLink } = req.params;
    const { uploaderName } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    
    if (!uploaderName) {
      return res.status(400).json({ error: 'Uploader name is required' });
    }

    const db = readDatabase();
    const albumIndex = db.albums.findIndex(a => a.shareLink === shareLink);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const photo = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploaderName,
      uploadedAt: new Date().toISOString(),
      url: `/uploads/${req.file.filename}`
    };

    db.albums[albumIndex].photos.push(photo);
    writeDatabase(db);

    res.status(201).json(photo);
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Delete album
app.delete('/api/albums/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = readDatabase();
    const albumIndex = db.albums.findIndex(a => a.id === id);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Delete associated photos from filesystem
    const album = db.albums[albumIndex];
    album.photos.forEach(photo => {
      const photoPath = path.join(UPLOADS_DIR, photo.filename);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    });

    db.albums.splice(albumIndex, 1);
    writeDatabase(db);

    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    console.error('Error deleting album:', error);
    res.status(500).json({ error: 'Failed to delete album' });
  }
});

app.listen(PORT, () => {
  console.log(`Photo Album API server running on port ${PORT}`);
});