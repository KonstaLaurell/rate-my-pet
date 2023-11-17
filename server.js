const express = require('express');
const session = require('express-session');
const passport = require('passport');
const ejs = require('ejs');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const bodyParser = require('body-parser');

// Database setup
const db = new sqlite3.Database('./mydb.sqlite3', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');

    // Modify the users table to include an isAdmin column
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        googleId TEXT,
        displayName TEXT,
        email TEXT,
        isAdmin BOOLEAN DEFAULT false,
        profilePicture TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS submitted_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        body TEXT,
        status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', etc.
        userId INTEGER,
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Ensure views directory is correctly set


// Session Configuration
app.use(session({
    secret: 'fegw4g43g4tfgrwfrbegregrgergfsfe', // Use a strong secret
    resave: false,
    saveUninitialized: false
}));

// Passport Serialization and Deserialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
        if (!row) return done(null, false);
        return done(null, row);
    });
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: '837097792501-2kbs5jregqflmvv8ifqtihkn149b37vj.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  (accessToken, refreshToken, profile, cb) => {
    const googleId = profile.id;
    const displayName = profile.displayName;
    const email = profile.emails[0].value;
    const profilePicture = profile.photos[0].value; // Get profile picture URL

    db.get("SELECT * FROM users WHERE googleId = ?", [googleId], (err, row) => {
        if (err) {
            return cb(err);
        }
        if (row) {
            // User exists, update profile picture
            db.run("UPDATE users SET displayName = ?, email = ?, profilePicture = ? WHERE googleId = ?", 
                [displayName, email, profilePicture, googleId], function(err) {
                if (err) {
                    return cb(err);
                }
                return cb(null, row);
            });
        } else {
            // New user, insert into database
            db.run("INSERT INTO users (googleId, displayName, email, profilePicture) VALUES (?, ?, ?, ?)", 
                [googleId, displayName, email, profilePicture], function(err) {
                if (err) {
                    return cb(err);
                }
                return cb(null, { id: this.lastID, googleId, displayName, email, profilePicture });
            });
        }
    });
}));

app.use(passport.initialize());
app.use(passport.session());

// Serve Static Files
app.use(express.static('public'));

// Root Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});


// Function to send message to Discord webhook
function sendLoginNotification(user) {
    const discordWebhookUrl = 'https://discord.com/api/webhooks/1173924337158471720/QSCVc6xYV90GAQeVYJkQCW_h9F40SedxNMF8CBOQWLzbtsw3KdpVFKKt8gHW8_P4EQ1Q';
    axios.post(discordWebhookUrl, {
        content: `User ${user.displayName} just logged in!`
    })
    .then(response => {
        console.log('Sent message to Discord');
    })
    .catch(error => {
        console.error('Error sending message to Discord', error);
    });
}
function sendlog(message){
    const discordWebhookUrl = 'https://discord.com/api/webhooks/1173924337158471720/QSCVc6xYV90GAQeVYJkQCW_h9F40SedxNMF8CBOQWLzbtsw3KdpVFKKt8gHW8_P4EQ1Q';
    axios.post(discordWebhookUrl, {
        content: `${message}, @everyone`
    })
}

// Google OAuth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    sendlog("logged "+req.user.displayName);
    res.redirect('/main'); // Redirect to the main page after successful login
    
});

// Main Page Route
// Main Page Route
app.get('/main', (req, res) => {
    if (req.isAuthenticated()) {
        const isAdmin = req.user.isAdmin;
        const profilePicture = req.user.profilePicture; // Include this line
        res.render('main', { isAdmin: isAdmin, profilePicture: profilePicture }); // Pass the profile picture URL to the template
    } else {
        res.redirect('/');
    }
});
app.post('/approve-content/:id', (req, res) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        const contentId = req.params.id;

        // Update the content status in the database (you may need to adjust your schema)
        db.run("UPDATE submitted_content SET status = 'approved' WHERE id = ?", [contentId], (err) => {
            if (err) {
                res.status(500).send("Error approving content");
                return;
            }

            // Redirect back to the admin panel or a different page as needed
            res.redirect('/admin');
        });
    } else {
        res.status(403).send("Access denied");
    }
});
// Profile Page Route
app.get('/profile', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('profile', { user: req.user });
    } else {
        res.redirect('/');
    }
});
app.get('/submit-content', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('content_submission'); // Render the content submission form
    } else {
        res.status(403).send("Access denied");
    }
});
app.post('/submit-content', (req, res) => {
    if (req.isAuthenticated()) {
        const title = req.body.title;
        const body = req.body.body;
        const userId = req.user.id; // Get the user's ID from the session

        // Insert the submitted content into the database with 'pending' status
        db.run(
            "INSERT INTO submitted_content (title, body, userId) VALUES (?, ?, ?)",
            [title, body, userId],
            function (err) {
                if (err) {
                    res.status(500).send("Error submitting content");
                    return;
                }
                res.redirect('/main'); // Redirect to the main page after submission
            }
        );
    } else {
        res.status(403).send("Access denied");
    }
});
// Route to display the admin panel
// Route to display the admin panel with pending content
app.get('/admin', (req, res) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        db.all("SELECT * FROM users", [], (err, users) => {
            if (err) {
                res.status(500).send("Error accessing database");
                return;
            }

            // Fetch the pending content list from the database
            db.all("SELECT * FROM submitted_content WHERE status = 'pending'", [], (err, contentList) => {
                if (err) {
                    res.status(500).send("Error accessing content database");
                    return;
                }

                // Render the admin panel and pass the contentList to the template
                res.render('admin', { users: users, contentList: contentList });
            });
        });
    } else {
        res.redirect('/');
    }
});

sendlog("website started")
app.post('/make-admin', (req, res) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        const googleId = req.body.userId;
        // Check if the user is already an admin
        db.get("SELECT isAdmin FROM users WHERE googleId = ?", [googleId], (err, row) => {
            if (err) {
                res.status(500).send("Error reading from database");
                return;
            }
            if (row && row.isAdmin) {
                // User is already an admin, remove admin privileges
                db.run("UPDATE users SET isAdmin = false WHERE googleId = ?", [googleId], (err) => {
                    if (err) {
                        res.status(500).send("Error updating database");
                        return;
                    }
                    res.redirect('/admin');
                });
            } else {
                // User is not an admin, grant admin privileges
                db.run("UPDATE users SET isAdmin = true WHERE googleId = ?", [googleId], (err) => {
                    if (err) {
                        res.status(500).send("Error updating database");
                        return;
                    }
                    res.redirect('/admin');
                });
            }
        });
    } else {
        res.status(403).send("Access denied");
    }
});


// Logout Route
app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
