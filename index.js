// calling the modules
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const errorHandler = require('./utils/errorHandler');


app.use(express.json());
app.use(cors());

// call in the db API script
const db = require('./db');

// ---- Rutas (importa todas antes de usarlas) ----
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const classRoutes = require('./routes/classRoutes');
const packageRoutes = require('./routes/packageRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes'); // <- aquí
const scheduleRoutes = require('./routes/scheduleRoutes');
const managerRoutes = require('./routes/managerRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Static (sirve /public primero)
app.use(express.static(path.join(__dirname, 'public')));

// ---- Monta rutas API (ANTES del error handler y del listen) ----
app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/manager', managerRoutes);
app.use('/classes', classRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/packages', packageRoutes);

// IMPORTANTE: el frontend usa /enroll/... => monta aquí en singular
app.use('/enroll', enrollmentRoutes); // <- CAMBIO respecto a /enrollments

app.use('/users', userRoutes);

// ---- Global Error Handler AL FINAL de las rutas ----
app.use(errorHandler);

// ---- Listen AL FINAL ----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Webpage running in http://localhost:${PORT}/`);
});
