// itinerary.js - Travel Plans page: full CRUD using Local Storage
const $ = id => document.getElementById(id);
const fields = ['country', 'startDate', 'endDate', 'travelers', 'budget', 'suggestion', 'notes'];

function showMsg(text, type) { $('msg').textContent = text; $('msg').className = 'msg ' + type; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// READ: display saved plans (with optional filter)
function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const plans = window.api.getPlans().filter(p => String(p.country).toLowerCase().includes(q));
  if (plans.length === 0) {
    $('listBox').innerHTML = '<div class="msg info">No travel plans found. Add one above or save one from the Explore page.</div>'; return; }
  $('listBox').innerHTML = '<table><tr><th>Country</th><th>Dates</th><th>Travelers</th><th>Budget</th><th>Weather / Suggestions</th><th>Actions</th></tr>' +
    plans.map(p => `<tr><td><b>${esc(p.country)}</b><br><small>${esc(p.capital)}</small></td>
      <td>${esc(p.startDate) || '-'} → ${esc(p.endDate) || '-'}</td><td>${p.travelers}</td><td>RM ${Number(p.budget).toLocaleString()}</td>
      <td><small>${esc(p.weather)}<br>${esc(p.suggestion)}<br><i>${esc(p.notes)}</i></small></td>
      <td><button class="small" data-edit="${p.id}">Edit</button> <button class="small del" data-del="${p.id}">Delete</button></td></tr>`).join('') + '</table>';
}

// Validation for create / update
function validate(d) {
  if (!/^[\p{L}\s.'-]{2,}$/u.test(d.country)) return 'Enter a valid country name.';
  if (!d.startDate || !d.endDate) return 'Start and end dates are required.';
  if (d.endDate < d.startDate) return 'End date cannot be before start date.';
  if (!Number.isInteger(d.travelers) || d.travelers < 1 || d.travelers > 20) return 'Travelers must be 1 to 20.';
  if (isNaN(d.budget) || d.budget < 0 || $('budget').value === '') return 'Budget must be 0 or more.';
  return null;
}

// CREATE / UPDATE
function save() {
  const d = { country: $('country').value.trim(), startDate: $('startDate').value, endDate: $('endDate').value,
    travelers: Number($('travelers').value), budget: Number($('budget').value),
    suggestion: $('suggestion').value.trim(), notes: $('notes').value.trim() };
  const err = validate(d);
  if (err) return showMsg(err, 'error');
  const plans = window.api.getPlans();        // read the array from Local Storage
  const id = $('planId').value;               // hidden field: empty = new, filled = edit
  if (id) { // UPDATE existing record, replace the matching record
    const i = plans.findIndex(p => String(p.id) === id);
    plans[i] = { ...plans[i], ...d };
    showMsg('Plan updated successfully.', 'success');
  } else {  // CREATE new record, add a new record with a unique id
    plans.push({ id: Date.now(), capital: '', weather: '-', ...d });
    showMsg('Plan added successfully.', 'success');
  }
  window.api.savePlans(plans);              // write back to Local Storage
  resetForm(false); renderList();
}

function resetForm(clearMessage = true) {
  $('planId').value = ''; fields.forEach(f => $(f).value = '');
  $('travelers').value = 1; $('formTitle').textContent = 'Add Travel Plan';
  $('saveBtn').textContent = 'Save Plan'; $('cancelBtn').classList.add('hidden');
  if (clearMessage) $('msg').className = 'msg';
}

// Load a record into the form for editing
function startEdit(id) {
  const p = window.api.getPlans().find(x => String(x.id) === id);
  if (!p) return;
  $('planId').value = p.id; fields.forEach(f => $(f).value = p[f] ?? '');
  $('formTitle').textContent = 'Edit Travel Plan'; $('saveBtn').textContent = 'Update Plan';
  $('cancelBtn').classList.remove('hidden'); window.scrollTo(0, 0);
}

// DELETE with confirmation
function remove(id) {
  if (!confirm('Delete this travel plan?')) return;
  window.api.savePlans(window.api.getPlans().filter(p => String(p.id) !== id));
  showMsg('Plan deleted.', 'success'); renderList();
}

// Event handlers (event delegation for Edit/Delete buttons)
$('saveBtn').addEventListener('click', save);
$('cancelBtn').addEventListener('click', () => resetForm());
$('search').addEventListener('input', renderList);
$('listBox').addEventListener('click', e => {
  if (e.target.dataset.edit) startEdit(e.target.dataset.edit);
  if (e.target.dataset.del) remove(e.target.dataset.del);
});
renderList();
