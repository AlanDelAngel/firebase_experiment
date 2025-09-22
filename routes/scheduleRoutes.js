// routes/scheduleRoutes.js
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /schedule/events?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Retorna las clases en el rango solicitado (por defecto: desde hoy → +60 días).
 */
router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = [];
    const params = [];

    if (start) {
      where.push('c.class_date >= ?');
      params.push(start);
    } else {
      where.push('c.class_date >= NOW()');
    }
    if (end) {
      where.push('c.class_date <= ?');
      params.push(end);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.query(
      `
      SELECT
        c.id,
        c.class_date,
        c.class_type,
        c.branch_id,
        b.branch_name,
        c.max_capacity,
        c.coach_id,
        CONCAT(u.first_name, ' ', u.last_name) AS coach_name,
        (
          SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id
        ) AS enrolled
      FROM classes c
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN users u ON u.id = c.coach_id
      ${whereSql}
      ORDER BY c.class_date ASC
      `,
      params
    );

    // Formato FullCalendar
    const events = rows.map(r => ({
      id: r.id,
      title: `${r.class_type} • ${r.branch_name}${r.coach_name ? ' • ' + r.coach_name : ''}`,
      start: new Date(r.class_date).toISOString(), // FullCalendar entiende ISO
      extendedProps: {
        class_type: r.class_type,
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        coach_id: r.coach_id,
        coach_name: r.coach_name,
        max_capacity: r.max_capacity,
        enrolled: r.enrolled,
        available: Math.max(0, r.max_capacity - r.enrolled),
      }
    }));

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /schedule/enroll/:class_id
 * Requiere: member autenticado.
 * Reglas:
 *  - Clase futura
 *  - No duplicado
 *  - Cupo disponible
 *  - Paquete activo con clases disponibles
 *  - Máx 2 clases por día (y sin solape en 2h)
 */
router.post('/enroll/:class_id', authenticate, authorize(['member']), async (req, res) => {
  const memberId = req.user.id;
  const classId = parseInt(req.params.class_id, 10);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1) Clase válida y futura
    const [clsRows] = await conn.query('SELECT * FROM classes WHERE id = ?', [classId]);
    if (!clsRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Class not found' });
    }
    const cls = clsRows[0];
    if (new Date(cls.class_date) < new Date()) {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot enroll to a past class' });
    }

    // 2) Duplicado
    const [dup] = await conn.query(
      'SELECT 1 FROM class_enrollments WHERE member_id = ? AND class_id = ? LIMIT 1',
      [memberId, classId]
    );
    if (dup.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Already enrolled in this class' });
    }

    // 3) Capacidad
    const [[{ enrolled }]] = await conn.query(
      'SELECT COUNT(*) AS enrolled FROM class_enrollments WHERE class_id = ?',
      [classId]
    );
    if (enrolled >= cls.max_capacity) {
      await conn.rollback();
      return res.status(400).json({ error: 'Class is full' });
    }

    // 4) Paquete activo con clases disponibles (el que vence antes)
    const [pkgRows] = await conn.query(
      `
      SELECT id, remaining_classes, expiration_date
      FROM class_packages
      WHERE member_id = ?
        AND remaining_classes > 0
        AND expiration_date >= CURDATE()
      ORDER BY expiration_date ASC
      LIMIT 1
      `,
      [memberId]
    );
    if (!pkgRows.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'No valid package available' });
    }
    const pkg = pkgRows[0];

    // 5) Máximo 2 clases por día
    const dayStart = new Date(cls.class_date);
    dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(cls.class_date);
    dayEnd.setHours(23,59,59,999);

    const [dayCount] = await conn.query(
      `
      SELECT COUNT(*) AS cnt
      FROM class_enrollments ce
      JOIN classes c ON c.id = ce.class_id
      WHERE ce.member_id = ?
        AND c.class_date BETWEEN ? AND ?
      `,
      [memberId, dayStart, dayEnd]
    );
    if (dayCount[0].cnt >= 2) {
      await conn.rollback();
      return res.status(400).json({ error: 'Daily limit reached (max 2 classes per day)' });
    }

    // 6) No solapar en 2h (clases de 2h)
    const [overlap] = await conn.query(
      `
      SELECT 1
      FROM class_enrollments ce
      JOIN classes c ON c.id = ce.class_id
      WHERE ce.member_id = ?
        AND ABS(TIMESTAMPDIFF(MINUTE, c.class_date, ?)) < 120
      LIMIT 1
      `,
      [memberId, cls.class_date]
    );
    if (overlap.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'You already have a class overlapping within 2 hours' });
    }

    // 7) Descontar paquete
    await conn.query(
      'UPDATE class_packages SET remaining_classes = remaining_classes - 1 WHERE id = ?',
      [pkg.id]
    );

    // 8) Crear inscripción
    await conn.query(
      'INSERT INTO class_enrollments (member_id, class_id) VALUES (?, ?)',
      [memberId, classId]
    );

    await conn.commit();
    res.json({ message: 'Enrollment successful' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// GET /schedule/class/:class_id/enrollments
// Solo manager/coach. Los coaches solo pueden ver SUS clases.
router.get('/class/:class_id/enrollments', authenticate, authorize(['manager','coach']), async (req, res) => {
  const classId = parseInt(req.params.class_id, 10);
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // Verifica clase y propiedad para coaches
    const [clsRows] = await db.query('SELECT id, coach_id FROM classes WHERE id = ?', [classId]);
    if (!clsRows.length) return res.status(404).json({ error: 'Class not found' });

    const cls = clsRows[0];
    if (role === 'coach' && cls.coach_id !== userId) {
      return res.status(403).json({ error: 'Not allowed to view enrollments for this class' });
    }

    // Lista de inscritos (nombre + id). Evitamos datos sensibles innecesarios.
    const [rows] = await db.query(
      `
      SELECT u.id AS member_id,
             u.first_name,
             u.last_name,
             u.email,
             ce.enrolled_at
      FROM class_enrollments ce
      JOIN users u ON u.id = ce.member_id
      WHERE ce.class_id = ?
      ORDER BY ce.enrolled_at ASC
      `,
      [classId]
    );

    // (Opcional) enmascarar email
    const masked = rows.map(r => {
      const [local, domain] = (r.email || '').split('@');
      const mlocal = local ? (local[0] + '***') : '';
      return {
        member_id: r.member_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: (local && domain) ? `${mlocal}@${domain}` : null,
        enrolled_at: r.enrolled_at
      };
    });

    res.json(masked);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
