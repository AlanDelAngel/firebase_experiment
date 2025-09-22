document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role'); // debe ser 'member' para poder inscribirse

  const calendarEl = document.getElementById('calendar');
  const detailsEl = document.getElementById('class-details');
  const enrollBtn = document.getElementById('enroll-btn');
  const upcomingEl = document.getElementById('upcoming-list');

  let selectedEvent = null;

  // Utilidad para pintar detalles
  function renderDetails(evt) {
    if (!evt) {
      detailsEl.innerHTML = 'Selecciona una clase en el calendario para ver detalles y disponibilidad.';
      enrollBtn.disabled = true;
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
    enrollBtn.disabled = !(token && role === 'member' && p.available > 0);
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

      upcomingEl.innerHTML = items.slice(0, 8).map(ev => {
        const p = ev.extendedProps;
        const dt = new Date(ev.start);
        return `
          <div class="class-card">
            <div><strong>${ev.title}</strong></div>
            <div class="muted">${dt.toLocaleString()}</div>
            <div class="muted">Disponibles: ${p.available}/${p.max_capacity}</div>
            <div style="margin-top:6px;">
              <button class="primary" data-id="${ev.id}" ${p.available === 0 || !(token && role==='member') ? 'disabled' : ''}>
                Inscribirme
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Listeners para botones de la lista
      upcomingEl.querySelectorAll('button.primary[data-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await enrollTo(btn.getAttribute('data-id'));
        });
      });
    } catch (e) {
      upcomingEl.innerHTML = `<div class="muted">Sin datos</div>`;
      console.error(e);
    }
  }

  // Inscripción
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
      // si teníamos un evento seleccionado, refrescar sus props
      if (selectedEvent) {
        selectedEvent = null; // forzar detalles limpios; se re-selecciona al hacer click de nuevo
        renderDetails(null);
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
        const qs = new URLSearchParams({
          start: info.startStr,
          end: info.endStr
        }).toString();
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

  // Botón lateral "Inscribirme"
  enrollBtn.addEventListener('click', async () => {
    if (!selectedEvent) return;
    await enrollTo(selectedEvent.id);
  });
});
