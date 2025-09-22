document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role'); // 'member' | 'coach' | 'manager'

  const calendarEl = document.getElementById('calendar');
  const detailsEl = document.getElementById('class-details');
  const enrollBtn = document.getElementById('enroll-btn');

  const memberActions = document.getElementById('member-actions');
  const staffPanel = document.getElementById('staff-enrollments');
  const enrolledListEl = document.getElementById('enrolled-list');

  const upcomingEl = document.getElementById('upcoming-list');

  let selectedEvent = null;

  // Mostrar/ocultar secciones según rol
  function applyRoleUI() {
    const isMember = role === 'member';
    if (memberActions) memberActions.style.display = isMember ? 'block' : 'none';
    if (staffPanel) staffPanel.style.display = (!isMember && (role === 'manager' || role === 'coach')) ? 'block' : 'none';
  }

  applyRoleUI();

  // Render detalles de evento
  function renderDetails(evt) {
    if (!evt) {
      detailsEl.innerHTML = 'Selecciona una clase en el calendario para ver detalles y disponibilidad.';
      if (enrollBtn) enrollBtn.disabled = true;
      if (enrolledListEl) enrolledListEl.innerHTML = 'Selecciona una clase para ver inscritos.';
      return;
    }
    const p = evt.extendedProps;
    const dt = new Date(evt.start);
    const lines = [
      `<div><strong>${evt.title}</strong></div>`,
      `<div class="muted">📅 ${dt.toLocaleString()}</div>`,
      `<div class="muted">🏢 ${p.branch_name}</div>`,
      `<div class="muted">👤 ${p.coach_name || 'Por asignar'}</div>`,
      `<div class="muted">🪑 ${p.available}/${p.max_capacity} lugares disponibles</div>`
    ];
    detailsEl.innerHTML = lines.join('');

    // Solo members pueden inscribirse
    if (role === 'member') {
      enrollBtn.disabled = !(token && p.available > 0);
    } else {
      // staff: carga lista de inscritos
      fetchEnrollmentsForClass(evt.id);
    }
  }

  // Cargar inscritos (staff)
  async function fetchEnrollmentsForClass(classId) {
    if (!(role === 'manager' || role === 'coach')) return;
    if (!token) {
      enrolledListEl.innerHTML = 'Debes iniciar sesión.';
      return;
    }
    try {
      const res = await fetch(`/schedule/class/${classId}/enrollments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        throw new Error(err.error || 'No se pudo cargar la lista de inscritos');
      }
      const list = await res.json();
      if (!list.length) {
        enrolledListEl.innerHTML = 'No hay inscritos para esta clase.';
        return;
      }
      enrolledListEl.innerHTML = list.map(item => `
        <div class="class-card">
          <div><strong>${item.first_name} ${item.last_name}</strong></div>
          <div class="muted">ID: ${item.member_id}</div>
          ${item.email ? `<div class="muted">${item.email}</div>` : ''}
          <div class="muted">Inscrito: ${new Date(item.enrolled_at).toLocaleString()}</div>
        </div>
      `).join('');
    } catch (e) {
      enrolledListEl.innerHTML = 'Error al cargar inscritos.';
      console.error(e);
    }
  }

  // Lista lateral de próximas clases (siguiente semana)
  async function renderUpcoming() {
    try {
      const now = new Date();
      const end = new Date(now); end.setDate(end.getDate() + 7);
      const qs = new URLSearchParams({
        start: now.toISOString().slice(0,10),
        end: end.toISOString().slice(0,10)
      }).toString();

      const resp = await fetch(`/schedule/events?${qs}`);
      if (!resp.ok) throw new Error('No se pudieron cargar próximas clases');
      const items = await resp.json();

      const isMember = role === 'member';
      upcomingEl.innerHTML = items.slice(0, 8).map(ev => {
        const p = ev.extendedProps;
        const dt = new Date(ev.start);
        return `
          <div class="class-card">
            <div><strong>${ev.title}</strong></div>
            <div class="muted">${dt.toLocaleString()}</div>
            <div class="muted">Disponibles: ${p.available}/${p.max_capacity}</div>
            <div style="margin-top:6px;">
              ${
                isMember
                  ? `<button class="primary" data-id="${ev.id}" ${p.available === 0 || !token ? 'disabled' : ''}>Inscribirme</button>`
                  : `<span class="muted">Solo lectura</span>`
              }
            </div>
          </div>
        `;
      }).join('');

      if (isMember) {
        upcomingEl.querySelectorAll('button.primary[data-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            await enrollTo(btn.getAttribute('data-id'));
          });
        });
      }
    } catch (e) {
      upcomingEl.innerHTML = `<div class="muted">Sin datos</div>`;
      console.error(e);
    }
  }

  // Inscripción (solo members)
  async function enrollTo(classId) {
    if (!token || role !== 'member') {
      alert('Inicia sesión como miembro para inscribirte.');
      return;
    }
    try {
      const res = await fetch(`/schedule/enroll/${classId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        throw new Error(err.error || 'No se pudo inscribir');
      }
      alert('¡Inscripción exitosa!');
      calendar.refetchEvents();
      renderUpcoming();
      if (selectedEvent) {
        // si staff estaba viendo inscritos, recarga lista
        if (role === 'manager' || role === 'coach') {
          fetchEnrollmentsForClass(selectedEvent.id);
        } else {
          selectedEvent = null;
          renderDetails(null);
        }
      }
    } catch (e) {
      alert(e.message);
    }
  }

  // FULLCALENDAR
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'es',
    height: 'auto',
    firstDay: 1,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    events: async (info, success, failure) => {
      try {
        const qs = new URLSearchParams({ start: info.startStr, end: info.endStr }).toString();
        const resp = await fetch(`/schedule/events?${qs}`);
        if (!resp.ok) throw new Error('No se pudieron cargar las clases');
        const events = await resp.json();
        success(events);
      } catch (e) {
        console.error(e);
        failure(e);
      }
    },
    eventClick: (info) => {
      selectedEvent = info.event;
      renderDetails(selectedEvent);
    },
    eventDidMount: (arg) => {
      const p = arg.event.extendedProps;
      arg.el.title = `${arg.event.title}\nDisponibles: ${p.available}/${p.max_capacity}`;
    }
  });

  calendar.render();
  renderDetails(null);
  renderUpcoming();

  // Botón lateral "Inscribirme" (solo members)
  if (enrollBtn) {
    enrollBtn.addEventListener('click', async () => {
      if (!selectedEvent) return;
      await enrollTo(selectedEvent.id);
    });
  }
});
