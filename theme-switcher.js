function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function initThemeSwitcher() {
  const select = document.getElementById('theme-select');
  if (!select) return;

  try {
    const response = await fetch('/api/themes');
    const themes = await response.json();
    const current = getCookie('theme');

    select.innerHTML = '';
    themes.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name.replace(/_/g, ' ');
      if (name === current) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      window.location.href = `/api/theme/${encodeURIComponent(select.value)}`;
    });
  } catch (error) {
    console.error('failed to load themes:', error);
  }
}

document.addEventListener('DOMContentLoaded', initThemeSwitcher);