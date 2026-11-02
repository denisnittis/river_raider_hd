// Virtual touch controls for mobile devices (D-Pad, Fire, Start/Reset, Select, etc.)

export const touchState = {
  up: false,
  down: false,
  left: false,
  right: false,
  fire: false,
  reset: false,
  select: false,
};

export function initTouchControls(callbacks = {}) {
  const container = document.getElementById('touch-controls');
  if (!container) return;

  const dpad = document.getElementById('dpad');
  const dpadStick = document.getElementById('dpad-stick');
  const btnFire = document.getElementById('btn-fire');
  const btnStart = document.getElementById('btn-start');
  const btnSelect = document.getElementById('btn-select');
  const btnMode = document.getElementById('btn-mode-touch');
  const btnSound = document.getElementById('btn-sound-touch');
  const btnPause = document.getElementById('btn-pause-touch');
  const btnFullscreen = document.getElementById('btn-fs-touch');

  // Haptic feedback helper
  function vibrate(ms = 15) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  // --- Multi-touch D-Pad handling with virtual joystick vector
  let dpadTouchId = null;
  let dpadCenter = { x: 0, y: 0, radius: 60 };

  function updateDpadCenter() {
    if (!dpad) return;
    const rect = dpad.getBoundingClientRect();
    dpadCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: Math.min(rect.width, rect.height) / 2,
    };
  }

  window.addEventListener('resize', updateDpadCenter);
  window.addEventListener('orientationchange', () => setTimeout(updateDpadCenter, 200));

  function setDirection(dx, dy, distance) {
    const deadzone = 12;
    const isMoving = distance > deadzone;

    // Reset directions
    touchState.left = false;
    touchState.right = false;
    touchState.up = false;
    touchState.down = false;

    if (isMoving) {
      // Horizontal threshold
      if (dx < -deadzone) touchState.left = true;
      else if (dx > deadzone) touchState.right = true;

      // Vertical threshold (accelerate / brake)
      if (dy < -deadzone) touchState.up = true;
      else if (dy > deadzone) touchState.down = true;
    }

    // Update visual arrows
    const upArrow = document.getElementById('dpad-up');
    const downArrow = document.getElementById('dpad-down');
    const leftArrow = document.getElementById('dpad-left');
    const rightArrow = document.getElementById('dpad-right');

    if (upArrow) upArrow.classList.toggle('active', touchState.up);
    if (downArrow) downArrow.classList.toggle('active', touchState.down);
    if (leftArrow) leftArrow.classList.toggle('active', touchState.left);
    if (rightArrow) rightArrow.classList.toggle('active', touchState.right);

    // Move stick visual
    if (dpadStick) {
      if (isMoving) {
        const maxDist = dpadCenter.radius * 0.55;
        const clampedDist = Math.min(distance, maxDist);
        const angle = Math.atan2(dy, dx);
        const sx = Math.cos(angle) * clampedDist;
        const sy = Math.sin(angle) * clampedDist;
        dpadStick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(1.05)`;
      } else {
        dpadStick.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    }
  }

  function handleDpadTouch(touch) {
    const dx = touch.clientX - dpadCenter.x;
    const dy = touch.clientY - dpadCenter.y;
    const distance = Math.hypot(dx, dy);
    setDirection(dx, dy, distance);
  }

  function resetDpad() {
    dpadTouchId = null;
    touchState.left = false;
    touchState.right = false;
    touchState.up = false;
    touchState.down = false;
    setDirection(0, 0, 0);
  }

  if (dpad) {
    dpad.addEventListener('touchstart', e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      updateDpadCenter();
      const touch = e.changedTouches[0];
      dpadTouchId = touch.identifier;
      handleDpadTouch(touch);
      vibrate(10);
    }, { passive: false });

    dpad.addEventListener('touchmove', e => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === dpadTouchId) {
          handleDpadTouch(touch);
          break;
        }
      }
    }, { passive: false });

    const endDpad = e => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === dpadTouchId) {
          resetDpad();
          break;
        }
      }
    };
    dpad.addEventListener('touchend', endDpad, { passive: false });
    dpad.addEventListener('touchcancel', endDpad, { passive: false });

    // Mouse fallback for testing
    let isMouseDown = false;
    dpad.addEventListener('mousedown', e => {
      isMouseDown = true;
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      updateDpadCenter();
      const dx = e.clientX - dpadCenter.x;
      const dy = e.clientY - dpadCenter.y;
      setDirection(dx, dy, Math.hypot(dx, dy));
    });
    window.addEventListener('mousemove', e => {
      if (!isMouseDown) return;
      const dx = e.clientX - dpadCenter.x;
      const dy = e.clientY - dpadCenter.y;
      setDirection(dx, dy, Math.hypot(dx, dy));
    });
    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        resetDpad();
      }
    });
  }

  // --- FIRE Button
  if (btnFire) {
    const startFire = e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      touchState.fire = true;
      btnFire.classList.add('active');
      vibrate(15);
    };
    const endFire = e => {
      e.preventDefault();
      touchState.fire = false;
      btnFire.classList.remove('active');
    };

    btnFire.addEventListener('touchstart', startFire, { passive: false });
    btnFire.addEventListener('touchend', endFire, { passive: false });
    btnFire.addEventListener('touchcancel', endFire, { passive: false });
    btnFire.addEventListener('mousedown', startFire);
    btnFire.addEventListener('mouseup', endFire);
    btnFire.addEventListener('mouseleave', endFire);
  }

  // --- START / RESET Button
  if (btnStart) {
    const triggerStart = e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      vibrate(25);
      btnStart.classList.add('active');
      if (callbacks.onReset) {
        callbacks.onReset();
      } else {
        touchState.reset = true;
        setTimeout(() => { touchState.reset = false; }, 200);
      }
      setTimeout(() => btnStart.classList.remove('active'), 200);
    };
    btnStart.addEventListener('touchstart', triggerStart, { passive: false });
    btnStart.addEventListener('click', triggerStart);
  }

  // --- SELECT Button
  if (btnSelect) {
    const triggerSelect = e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      vibrate(15);
      btnSelect.classList.add('active');
      if (callbacks.onSelect) {
        callbacks.onSelect();
      } else {
        touchState.select = true;
        setTimeout(() => { touchState.select = false; }, 200);
      }
      setTimeout(() => btnSelect.classList.remove('active'), 200);
    };
    btnSelect.addEventListener('touchstart', triggerSelect, { passive: false });
    btnSelect.addEventListener('click', triggerSelect);
  }

  // --- MODE Switcher (Remaster <-> Original)
  if (btnMode) {
    btnMode.addEventListener('click', e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      vibrate(10);
      if (callbacks.onToggleMode) callbacks.onToggleMode();
    });
  }

  // --- SOUND Button (Mute toggle)
  if (btnSound) {
    btnSound.addEventListener('click', e => {
      e.preventDefault();
      if (callbacks.onAudioStart) callbacks.onAudioStart();
      vibrate(10);
      if (callbacks.onToggleMute) {
        const isMuted = callbacks.onToggleMute();
        btnSound.textContent = isMuted ? '🔇 Mudo' : '🔊 Som';
        btnSound.classList.toggle('muted', isMuted);
      }
    });
  }

  // --- PAUSE Button
  if (btnPause) {
    btnPause.addEventListener('click', e => {
      e.preventDefault();
      vibrate(10);
      if (callbacks.onTogglePause) {
        const isPaused = callbacks.onTogglePause();
        btnPause.textContent = isPaused ? '▶ Continuar' : '⏸ Pausa';
        btnPause.classList.toggle('active', isPaused);
      }
    });
  }

  // --- FULLSCREEN Button
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', e => {
      e.preventDefault();
      vibrate(10);
      if (callbacks.onToggleFullscreen) callbacks.onToggleFullscreen();
    });
  }

  // Prevent double tap zoom on buttons
  container.addEventListener('touchstart', e => {
    if (callbacks.onAudioStart) callbacks.onAudioStart();
  }, { passive: true });
}
