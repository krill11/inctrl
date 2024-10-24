const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const { Groq } = require('groq-sdk');

const app = express();
const port = 3000;
const { exec } = require('child_process');

// Connect to SQLite database
const db = new sqlite3.Database('./courses.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the courses database.');
});

const groq = new Groq({ apiKey: "<your key here>" });

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    course_id INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses (id)
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS lectures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit_id INTEGER,
    FOREIGN KEY (unit_id) REFERENCES units (id)
  )`);
});

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
const fs = require('fs');

// API routes
app.get('/api/courses', (req, res) => {
    db.all(`SELECT * FROM courses`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/courses', (req, res) => {
    const { name, description } = req.body;
    db.run(`INSERT INTO courses (name, description) VALUES (?, ?)`, [name, description], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, name, description });
    });
});

app.get('/api/units/:courseId', (req, res) => {
    const { courseId } = req.params;
    db.all(`SELECT * FROM units WHERE course_id = ?`, [courseId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/units', (req, res) => {
    const { name, description, courseId } = req.body;
    db.run(`INSERT INTO units (name, description, course_id) VALUES (?, ?, ?)`, [name, description, courseId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, name, description, courseId });
    });
});

app.get('/api/lectures/:unitId', (req, res) => {
    const { unitId } = req.params;
    db.all(`SELECT * FROM lectures WHERE unit_id = ?`, [unitId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows); // Ensure ai_summary is part of the rows
    });
});

app.post('/api/lectures', (req, res) => {
    const { name, unitId } = req.body;
    db.run(`INSERT INTO lectures (name, unit_id) VALUES (?, ?)`, [name, unitId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, name, unitId });
    });
});

// Serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public', 'uploads'))
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-').toLowerCase())
    }
});

const upload = multer({ storage: storage });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Add audioUrl column to lectures table
// Check if audioUrl column exists in lectures table, if not, add it
// Check if audioUrl column exists in lectures table, if not, add it
// Check if audioUrl and transcript columns exist in lectures table, if not, add them

db.all("PRAGMA table_info(lectures)", (err, rows) => {
    if (err) {
      console.error(err.message);
      return;
    }
    
    const audioUrlColumnExists = rows.some(row => row.name === 'audioUrl');
    const transcriptColumnExists = rows.some(row => row.name === 'transcript');
    const notesColumnExists = rows.some(row => row.name === 'notes');
    const aiSummaryColumnExists = rows.some(row => row.name === 'ai_summary');

if (!aiSummaryColumnExists) {
    db.run(`ALTER TABLE lectures ADD COLUMN ai_summary TEXT`, (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log("Added ai_summary column to lectures table");
        }
    });
}

    if (!notesColumnExists) {
        db.run(`ALTER TABLE lectures ADD COLUMN notes TEXT`, (err) => {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Added notes column to lectures table");
            }
        });
    }

    
    if (!audioUrlColumnExists) {
      db.run(`ALTER TABLE lectures ADD COLUMN audioUrl TEXT`, (err) => {
        if (err) {
          console.error(err.message);
        } else {
          console.log("Added audioUrl column to lectures table");
        }
      });
    }

    if (!transcriptColumnExists) {
      db.run(`ALTER TABLE lectures ADD COLUMN transcript TEXT`, (err) => {
        if (err) {
          console.error(err.message);
        } else {
          console.log("Added transcript column to lectures table");
        }
      });
    }
});

// Add new routes for audio handling
app.post('/api/lectures/:lectureId/notes', (req, res) => {
    const { lectureId } = req.params;
    const { notes } = req.body;

    db.run(`UPDATE lectures SET notes = ? WHERE id = ?`, [notes, lectureId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.get('/api/lectures/:lectureId/notes', (req, res) => {
    const { lectureId } = req.params;

    db.get(`SELECT notes FROM lectures WHERE id = ?`, [lectureId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ notes: row ? row.notes : null });
    });
});
// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.post('/api/lectures/:lectureId/audio', upload.single('audio'), (req, res) => {
    console.log('Received audio upload request for lecture:', req.params.lectureId);
    
    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    console.log('File details:', req.file);
    
    const { lectureId } = req.params;
    const audioUrl = `/uploads/${req.file.filename}`;
    const fullPath = path.join(__dirname, 'public', audioUrl);
    
    console.log('Full file path:', fullPath);
    
    // Check if file exists
    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error('File does not exist:', err);
            return res.status(500).json({ error: 'File was not saved correctly' });
        }
        
        // File exists, update database
        db.run(`UPDATE lectures SET audioUrl = ? WHERE id = ?`, [audioUrl, lectureId], function (err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('Database updated successfully');
            res.json({ audioUrl: audioUrl });
        });
    });
});

app.delete('/api/courses/:courseId', (req, res) => {
    const { courseId } = req.params;
    db.run(`DELETE FROM courses WHERE id = ?`, [courseId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.delete('/api/units/:unitId', (req, res) => {
    const { unitId } = req.params;
    db.run(`DELETE FROM units WHERE id = ?`, [unitId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.delete('/api/lectures/:lectureId', (req, res) => {
    const { lectureId } = req.params;
    db.run(`DELETE FROM lectures WHERE id = ?`, [lectureId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.delete('/api/lectures/:lectureId/audio', (req, res) => {
    const { lectureId } = req.params;

    db.get(`SELECT audioUrl FROM lectures WHERE id = ?`, [lectureId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        if (row && row.audioUrl) {
            const filePath = path.join(__dirname, row.audioUrl);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(err);
                }
            });

            db.run(`UPDATE lectures SET audioUrl = NULL WHERE id = ?`, [lectureId], function (err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ success: true });
            });
        } else {
            res.status(404).json({ error: 'Audio not found' });
        }
    });
});


app.post('/api/lectures/:lectureId/transcribe', async (req, res) => {
    const { lectureId } = req.params;
  
    try {
      // Get the audio URL from the database
      const row = await new Promise((resolve, reject) => {
        db.get(`SELECT audioUrl FROM lectures WHERE id = ?`, [lectureId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
  
      if (!row || !row.audioUrl) {
        return res.status(404).json({ error: 'Audio not found for this lecture' });
      }
  
      const audioFilePath = path.join(__dirname, 'public', row.audioUrl);
      
      // Run the Python script
      exec(`python transcription_service.py "${audioFilePath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return res.status(500).json({ error: 'Failed to transcribe audio' });
        }
        
        const transcription = stdout.trim();
  
        // Update the database with the transcription
        db.run(`UPDATE lectures SET transcript = ? WHERE id = ?`, [transcription, lectureId], (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to save transcription' });
          }
          res.json({ success: true, transcription });
        });
      });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  });

  app.post('/api/lectures/summarize', async (req, res) => {
    const { transcript } = req.body;

    if (!transcript) {
        console.error('No transcript provided');
        return res.status(400).json({ error: 'No transcript provided' });
    }

    console.log('Received transcript:', transcript.substring(0, 100) + '...');

    try {
        console.log('Sending request to Groq API...');
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an AI assistant that summarizes lecture transcripts concisely and accurately. Output only the summary, no intro, no outro, no commentary, no commentary, no commentary. Make lists, tables, or whatever is nescessary. Format in markdown."
                },
                {
                    role: "user",
                    content: `Summarize the following lecture transcript:\n\n${transcript}`
                }
            ],
            model: "llama3-8b-8192",
            max_tokens: 4096,
            temperature: 0.7,
        });

        console.log('Received response from Groq API:', completion);

        const summary = completion.choices[0]?.message?.content || "";
        console.log('Generated summary:', summary);

        if (!summary) {
            console.error('No summary generated');
            return res.status(500).json({ error: 'Failed to generate summary' });
        }

        res.json({ summary });
    } catch (error) {
        console.error('Error generating AI summary:', error);
        res.status(500).json({ error: 'Failed to generate AI summary', details: error.message });
    }
});

app.post('/api/lectures/:lectureId/summary', (req, res) => {
    const { lectureId } = req.params;
    const { summary } = req.body;

    console.log('Saving summary for lecture:', lectureId);

    db.run('UPDATE lectures SET ai_summary = ? WHERE id = ?', [summary, lectureId], function(err) {
        if (err) {
            console.error('Error saving summary:', err);
            res.status(500).json({ error: 'Failed to save summary' });
            return;
        }
        console.log('Summary saved successfully');
        res.json({ success: true, message: 'Summary saved successfully' });
    });
});
// Serve uploaded files
app.use('/uploads', express.static('uploads'));