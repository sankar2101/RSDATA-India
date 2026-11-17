(() => {
  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('#menuToggle');
  const navLinks = document.querySelector('#navLinks');
  const progress = document.querySelector('#scrollProgress');
  const form = document.querySelector('#contactForm');
  const status = document.querySelector('#formStatus');

  document.querySelector('#year').textContent = new Date().getFullYear();

  const updateScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle('scrolled', y > 22);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
  };
  updateScroll();
  window.addEventListener('scroll', updateScroll, { passive: true });

  const closeMenu = () => {
    navLinks.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation menu');
    document.body.classList.remove('menu-open');
  };

  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
    navLinks.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 850) closeMenu(); });

  // Gentle reveal animation, with a graceful fallback for reduced-motion users.
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  // Interactive focus bar in the hero.
  document.querySelectorAll('.focus-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.focus-tab').forEach(other => {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
      });
    });
  });

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submitButton = form.querySelector('button[type="submit"]');
      const buttonText = submitButton.innerHTML;
      submitButton.disabled = true;
      submitButton.innerHTML = 'Sending…';
      status.textContent = 'Sending your inquiry…';
      status.classList.remove('status-error', 'status-success');

      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || 'Unable to submit your inquiry.');
        status.textContent = result.message;
        status.classList.add('status-success');
        form.reset();
      } catch (error) {
        status.textContent = error.message || 'Something went wrong. Please email indsupports@rsdataarchitect.com.';
        status.classList.add('status-error');
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = buttonText;
      }
    });
  }
})();
