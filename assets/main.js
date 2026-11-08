/* Doran personal site — small progressive enhancements, no dependencies. */
(function () {
  "use strict";

  var header = document.getElementById("header");
  var hero = document.getElementById("hero");
  var toggle = document.getElementById("nav-toggle");
  var links = document.getElementById("nav-links");

  /* header shadow on scroll */
  function onScroll() {
    if (!header) return;
    var y = window.scrollY || 0;
    if (hero) {
      var heroBottom = hero.offsetTop + hero.offsetHeight;
      header.classList.toggle("on-light", y < heroBottom - window.innerHeight * 0.55);
    }
    header.classList.toggle("scrolled", y > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* mobile nav */
  function setNav(open) {
    document.body.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (toggle) toggle.textContent = open ? "✕" : "☰";
  }
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      setNav(!document.body.classList.contains("nav-open"));
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNav(false);
    });
  }

  /* reveal on scroll — fail-safe: content stays visible unless the observer is ready */
  var revealItems = document.querySelectorAll(".reveal");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function revealAll() {
    revealItems.forEach(function (el) { el.classList.add("in"); });
  }
  if (reduce || !("IntersectionObserver" in window)) {
    revealAll();
  } else {
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      document.body.classList.add("reveal-on");
      revealItems.forEach(function (el) { io.observe(el); });
      /* if something prevents the observer callback, never leave content hidden */
      setTimeout(revealAll, 2500);
    } catch (error) {
      revealAll();
    }
  }

  /* footer year */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
