const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/users', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, first_name, last_name, email, role FROM users'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user role (con upsert a tablas hijas)
router.put('/users/:id/role', authenticate, authorize(['manager']), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!['member', 'coach'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Solo member o coach.' });
  }

  try {
    // 1) Actualiza rol en users
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    // 2) Asegura fila en tabla hija correspondiente (NO borramos la otra para evitar problemas de FKs históricos)
    if (role === 'coach') {
      await db.query(
        'INSERT INTO coaches (id, specialization) VALUES (?, NULL) ON DUPLICATE KEY UPDATE specialization = specialization',
        [userId]
      );
    } else {
      await db.query(
        `INSERT INTO members (id, membership_paid, membership_expiration)
         VALUES (?, FALSE, NULL)
         ON DUPLICATE KEY UPDATE membership_paid = membership_paid`,
        [userId]
      );
    }

    res.json({ success: true, message: 'Rol actualizado y sincronizado.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar sucursales para el <select>
router.get('/branches', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, branch_name FROM branches ORDER BY branch_name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar coaches válidos (id + nombre) para el <select>
router.get('/coaches', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name
       FROM coaches c
       JOIN users u ON u.id = c.id
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Delete a user
router.delete('/users/:id', authenticate, authorize(['manager']), async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- NEW: Get branches (for the class form) ----
router.get('/branches', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, branch_name FROM branches ORDER BY branch_name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all classes (with enrolled count)
router.get('/classes', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [classes] = await db.query(
      `SELECT 
         c.id, c.class_date, c.class_type, c.branch_id, c.coach_id, c.max_capacity,
         (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) AS enrolled
       FROM classes c
       ORDER BY c.class_date DESC`
    );
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear clase (branch_id y class_type son requeridos; coach_id puede ser NULL)
router.post('/classes', authenticate, authorize(['manager']), async (req, res) => {
  let { coach_id, branch_id, class_type, class_date, max_capacity } = req.body;

  if (!branch_id || !class_type || !class_date || !max_capacity) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  // Normaliza coach_id a null si viene vacío/0
  if (coach_id === '' || coach_id === undefined || coach_id === null || coach_id === 0 || coach_id === '0') {
    coach_id = null;
  }

  try {
    if (coach_id !== null) {
      const [chk] = await db.query('SELECT 1 FROM coaches WHERE id = ?', [coach_id]);
      if (chk.length === 0) {
        return res.status(400).json({ error: 'El coach especificado no existe.' });
      }
    }

    await db.query(
      `INSERT INTO classes (coach_id, branch_id, class_type, class_date, max_capacity)
       VALUES (?, ?, ?, ?, ?)`,
      [coach_id, branch_id, class_type, class_date, max_capacity]
    );

    res.json({ success: true, message: 'Clase creada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a class (only if no enrollments)
router.delete('/classes/:id', authenticate, authorize(['manager']), async (req, res) => {
  const classId = parseInt(req.params.id, 10);
  try {
    const [[{ enrolled }]] = await db.query(
      'SELECT COUNT(*) AS enrolled FROM class_enrollments WHERE class_id = ?',
      [classId]
    );

    if (enrolled > 0) {
      return res.status(409).json({ 
        error: 'No puedes eliminar esta clase porque tiene usuarios inscritos.' 
      });
    }

    const [result] = await db.query('DELETE FROM classes WHERE id = ?', [classId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    res.json({ success: true, message: 'Clase eliminada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/memberships', authenticate, authorize(['manager']), async (req, res) => {
  try {
    const [memberships] = await db.query(`
      SELECT users.first_name AS member_name,
             class_packages.package_type,
             class_packages.remaining_classes,
             class_packages.expiration_date
      FROM class_packages
      JOIN users ON class_packages.member_id = users.id
      ORDER BY class_packages.expiration_date ASC
    `);
  res.json(memberships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
