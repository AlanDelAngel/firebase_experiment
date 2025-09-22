document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) {
    alert("Acceso denegado. Por favor, inicia sesión.");
    window.location.href = "/auth.html";
    return;
  }

  if (role !== "manager") {
    alert("Acceso denegado. Solo los administradores pueden acceder.");
    window.location.href = "/profile.html";
    return;
  }

  // Utils
  function toMySQLDateTime(dtLocalValue) {
    // "2025-09-21T19:00" -> "2025-09-21 19:00:00"
    if (!dtLocalValue) return null;
    return dtLocalValue.replace('T', ' ') + ':00';
  }

  async function fetchUsers() {
    try {
      const response = await fetch("/manager/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const users = await response.json();
      const usersTable = document.querySelector("#users-table tbody");

      usersTable.innerHTML = users
        .filter(user => user.role !== "manager")
        .map(user => `
          <tr>
            <td>${user.id}</td>
            <td>${user.first_name} ${user.last_name}</td>
            <td>${user.email}</td>
            <td>
              <select id="role-${user.id}">
                <option value="member" ${user.role === "member" ? "selected" : ""}>Miembro</option>
                <option value="coach" ${user.role === "coach" ? "selected" : ""}>Coach</option>
              </select>
            </td>
            <td>
              <button class="update-btn" onclick="updateUserRole(${user.id})">Actualizar</button>
            </td>
          </tr>
        `).join("");
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
    }
  }

  async function fetchBranches() {
    try {
      const res = await fetch("/manager/branches", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const branches = await res.json();
      const sel = document.getElementById("branch-id");
      sel.innerHTML = branches.map(b => `<option value="${b.id}">${b.branch_name}</option>`).join("");
    } catch (e) {
      console.error("Error al cargar sucursales:", e);
    }
  }
  

  async function fetchClasses() {
    try {
      const response = await fetch("/manager/classes", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const classes = await response.json();
      const classesTable = document.querySelector("#classes-table tbody");
      if (!classesTable) return;

      classesTable.innerHTML = classes.map(cls => `
        <tr>
          <td>${cls.id}</td>
          <td>${new Date(cls.class_date).toLocaleString()}</td>
          <td>${cls.class_type}</td>
          <td>${cls.branch_id}</td>
          <td>${cls.coach_id || "TBA"}</td>
          <td>${cls.max_capacity}</td>
          <td><button class="delete-btn" onclick="deleteClass(${cls.id})">Eliminar</button></td>
        </tr>
      `).join("");
    } catch (error) {
      console.error("Error al cargar clases:", error);
    }
  }

  async function fetchMemberships() {
    try {
      const response = await fetch("/manager/memberships", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const memberships = await response.json();
      const membershipsTable = document.querySelector("#memberships-table tbody");

      membershipsTable.innerHTML = memberships.map(pkg => `
        <tr>
          <td>${pkg.member_name}</td>
          <td>${pkg.package_type} clases</td>
          <td>${pkg.remaining_classes}</td>
          <td>${new Date(pkg.expiration_date).toLocaleDateString()}</td>
        </tr>
      `).join("");
    } catch (error) {
      console.error("Error al cargar membresías:", error);
    }
  }

  // ---- NEW: submit for Add Class form ----
  const addClassForm = document.getElementById("add-class-form");
  if (addClassForm) {
    addClassForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const class_date = toMySQLDateTime(document.getElementById("class-date").value);
      const class_type = document.getElementById("class-type").value.trim();
      const branch_id = parseInt(document.getElementById("branch-id").value, 10);
      const coach_id_raw = document.getElementById("coach-id").value;
      const coach_id = coach_id_raw ? parseInt(coach_id_raw, 10) : null;
      const max_capacity = parseInt(document.getElementById("max-capacity").value, 10);

      if (!class_date || !class_type || !branch_id || !max_capacity) {
        alert("Por favor completa los campos requeridos.");
        return;
      }

      try {
        const resp = await fetch("/manager/classes", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            class_date,
            class_type,
            branch_id,
            coach_id,
            max_capacity
          })
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Error al crear la clase");
        }

        alert("Clase creada correctamente.");
        addClassForm.reset();
        fetchClasses();
      } catch (err) {
        console.error(err);
        alert(err.message || "No se pudo crear la clase.");
      }
    });
  }

  document.getElementById("logout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/auth.html";
  });

  await fetchUsers();
  await fetchBranches();
  await fetchClasses();
  await fetchMemberships();
});

// Global for role update
window.updateUserRole = async function(userId) {
  const token = localStorage.getItem("token");
  const selectedRole = document.getElementById(`role-${userId}`).value;
  try {
    const response = await fetch(`/manager/users/${userId}/role`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role: selectedRole })
    });
    if (response.ok) {
      alert("Rol actualizado correctamente.");
    } else {
      alert("Error al actualizar el rol.");
    }
  } catch (error) {
    console.error("Error al actualizar rol:", error);
  }
};

// ---- NEW: global deleteClass ----
window.deleteClass = async function(id) {
  const token = localStorage.getItem("token");
  if (!confirm("¿Eliminar esta clase?")) return;
  try {
    const res = await fetch(`/manager/classes/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "No se pudo eliminar");
    }
    alert("Clase eliminada.");
    // refresh
    const tbody = document.querySelector("#classes-table tbody");
    if (tbody) {
      // simple refresh
      location.reload();
    }
  } catch (e) {
    console.error(e);
    alert(e.message || "Error eliminando clase.");
  }
};
