(function(){
    const PAUSE_MS = 2000;   // wait at bottom/top
    const SCROLL_MS = 18000; // scrolling duration requested

    function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

    function animateScrollTo(target, duration){
      return new Promise(resolve => {
        const start = window.scrollY || document.documentElement.scrollTop;
        const change = target - start;
        const t0 = performance.now();
        function easeInOutCubic(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }
        function frame(now){
          const elapsed = now - t0;
          const t = Math.min(1, elapsed / duration);
          const eased = easeInOutCubic(t);
          const y = start + change * eased;
          window.scrollTo(0, y);
          if (elapsed < duration) requestAnimationFrame(frame);
          else { window.scrollTo(0, target); resolve(); }
        }
        requestAnimationFrame(frame);
      });
    }

    async function autoScrollLoop(){
      while(true){
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (max > 0){
          await animateScrollTo(max, SCROLL_MS);
          await sleep(PAUSE_MS);
          await animateScrollTo(0, SCROLL_MS);
          await sleep(PAUSE_MS);
        } else {
          await sleep(PAUSE_MS);
        }
      }
    }

    window.addEventListener('load', autoScrollLoop, { once: true });
  })();