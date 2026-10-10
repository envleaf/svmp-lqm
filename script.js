// script.js

// This function adds or removes the 'dark-mode' class from the body
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// Check the user's preference using 'matchMedia'
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// Apply the theme on initial page load
applyTheme(prefersDark.matches);

// Listen for changes in the user's preference
prefersDark.addEventListener('change', (event) => {
  applyTheme(event.matches);
});