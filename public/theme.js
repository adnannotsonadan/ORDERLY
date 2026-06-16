(function () {
  const DEFAULT = {
    brandColor: '#c8773a',
    bgColor: '#f7f4f0',
    surfaceColor: '#ffffff',
    textColor: '#1a1714',
    fontFamily: 'DM Sans',
    cafeName: 'Our Cafe',
    logoUrl: '',
  };

  function getCafeId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('cafe_id');
  }

  async function resolveCafeId() {
    const fromUrl = getCafeId();
    if (fromUrl) return fromUrl;
    if (window.QRCafeApp && window.QRCafeApp.getCurrentCafeId) {
      return window.QRCafeApp.getCurrentCafeId();
    }
    return null;
  }

  function hexToHsl(hex) {
    if (!hex || hex.length < 7) return [0, 0, 50];
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h;
    let s;
    let l = (max + min) / 2;
    if (max === min) {
      h = 0;
      s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function darken(hex, pct) {
    const [h, s, l] = hexToHsl(hex);
    return `hsl(${h}, ${s}%, ${Math.max(0, l - pct)}%)`;
  }

  function lighten(hex, pct) {
    const [h, s, l] = hexToHsl(hex);
    return `hsl(${h}, ${Math.max(0, s - 20)}%, ${Math.min(100, l + pct)}%)`;
  }

  function getFontUrl(font) {
    const map = {
      'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
      Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
      Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
      Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    };
    return map[font] || map['DM Sans'];
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--brand', theme.brandColor);
    root.style.setProperty('--brand-dark', darken(theme.brandColor, 12));
    root.style.setProperty('--brand-light', lighten(theme.brandColor, 38));
    root.style.setProperty('--bg', theme.bgColor);
    root.style.setProperty('--surface', theme.surfaceColor);
    root.style.setProperty('--text', theme.textColor);
    root.style.setProperty('--font-body', `'${theme.fontFamily}', sans-serif`);

    let fontLink = document.querySelector('link[data-theme-font]');
    if (!fontLink) {
      fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.setAttribute('data-theme-font', '1');
      document.head.appendChild(fontLink);
    }
    fontLink.href = getFontUrl(theme.fontFamily);

    document.querySelectorAll('.cafe-name-text').forEach((el) => {
      el.textContent = theme.cafeName || 'Our Cafe';
    });

    document.querySelectorAll('.cafe-logo').forEach((el) => {
      if (theme.logoUrl) {
        el.src = theme.logoUrl;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  }

  async function fetchAndApply() {
    try {
      const cafeId = await resolveCafeId();
      const theme = window.QRCafeApp ? await window.QRCafeApp.getTheme(cafeId) : { ...DEFAULT };
      window._cafeTheme = { ...DEFAULT, ...theme };
      applyTheme(window._cafeTheme);
    } catch {
      window._cafeTheme = { ...DEFAULT };
      applyTheme(window._cafeTheme);
    }
  }

  applyTheme(DEFAULT);
  window.addEventListener('load', fetchAndApply);

  window.CafeTheme = {
    get() {
      return window._cafeTheme || { ...DEFAULT };
    },
    async save(updates) {
      const cafeId = await resolveCafeId();
      const next = window.QRCafeApp ? await window.QRCafeApp.saveTheme(cafeId, updates) : { ...DEFAULT };
      window._cafeTheme = { ...DEFAULT, ...next };
      applyTheme(window._cafeTheme);
      return window._cafeTheme;
    },
    async reset() {
      const cafeId = await resolveCafeId();
      const next = window.QRCafeApp ? await window.QRCafeApp.resetTheme(cafeId) : { ...DEFAULT };
      window._cafeTheme = { ...DEFAULT, ...next };
      applyTheme(window._cafeTheme);
      return window._cafeTheme;
    },
    apply: applyTheme,
    DEFAULT,
    getCafeId,
  };
})();
