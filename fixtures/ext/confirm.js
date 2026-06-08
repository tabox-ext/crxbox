document.getElementById('del').addEventListener('click', () => {
  const ok = window.confirm('Are you sure?');
  document.getElementById('status').textContent = ok ? 'deleted' : 'cancelled';
});
