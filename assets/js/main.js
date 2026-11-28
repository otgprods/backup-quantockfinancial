/* Quantock Financial - site interactions (no dependencies) */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EMAIL = window.QF_EMAIL || "office@quantockfinancial.co.uk";
  /* Anti-spam trap: a hidden field only bots fill. Browser autofill can also fill it, so it
     only counts as a bot when the form is sent within a few seconds of the page loading. */
  var LOADED = Date.now();
  function isBot(form) { var h = form.querySelector("[name=qf_trap]"); return !!(h && h.value) && Date.now() - LOADED < 4000; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- Year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Mobile nav ---------- */
  var cb = $("#nav-cb");
  if (cb) {
    cb.addEventListener("change", function () { document.body.classList.toggle("nav-open", cb.checked); });
    var closeNav = function () { cb.checked = false; document.body.classList.remove("nav-open"); };
    /* Going to another page: leave the menu open so the whole screen fades out as one,
       instead of the panel sliding away over the incoming page. Same-page links close it. */
    $$(".nav a").forEach(function (a) { a.addEventListener("click", function (e) {
      var leaving = a.origin === location.origin && a.pathname.replace(/\.html$/, "") !== location.pathname.replace(/\.html$/, "") &&
        !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (!leaving) return closeNav();
      /* fade the menu's links out first, then go (prerendered pages still open instantly after) */
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !document.body.classList.contains("nav-open")) return;
      e.preventDefault();
      document.body.classList.add("nav-leaving");
      setTimeout(function () { location.href = a.href; }, 150);
    }); });
    /* coming back with the Back button: never restore the page with the menu still open */
    window.addEventListener("pageshow", function (e) { if (e.persisted && cb.checked) closeNav(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cb.checked) { cb.checked = false; document.body.classList.remove("nav-open"); } });
  }

  /* ---------- Reveal on scroll ---------- */
  var rev = $$(".reveal:not(.in)");
  if (rev.length && "IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    rev.forEach(function (el) { io.observe(el); });
  } else { rev.forEach(function (el) { el.classList.add("in"); }); }

  /* ---------- Hero video: respect reduced motion / data saver ---------- */
  var v = $(".hero video[data-src]");
  if (v && !reduce && !(navigator.connection && navigator.connection.saveData)) {
    var startVideo = function () {
      v.addEventListener("playing", function () { v.classList.add("ready"); }, { once: true });
      var webm = v.getAttribute("data-webm");
      v.src = webm && v.canPlayType('video/webm; codecs="vp9"') ? webm : v.getAttribute("data-src");
      v.preload = "auto"; v.autoplay = true;
      v.load(); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    };
    // poster photo paints instantly; the film starts straight after
    if (document.readyState === "complete") startVideo(); else window.addEventListener("load", startVideo);
  }

  /* ---------- How much could I borrow? (4.5x to 5x income) ---------- */
  $$("[data-borrow]").forEach(function (box) {
    var i1 = $("#b-inc1", box), i2 = $("#b-inc2", box), dp = $("#b-dep", box);
    var fmt = function (n) { return Math.round(n / 1000) * 1000 > 0 ? (Math.round(n / 1000) * 1000).toLocaleString("en-GB") : "0"; };
    function num(el) { var v = parseFloat(el.value); return isFinite(v) && v > 0 ? v : 0; }
    function run() {
      var inc = num(i1) + num(i2), lo = inc * 4.5, hi = inc * 5;
      $("[data-b-low]", box).textContent = fmt(lo);
      $("[data-b-high]", box).textContent = fmt(hi);
      $("[data-b-price]", box).textContent = fmt(hi + num(dp));
    }
    $$("input[type=range]", box).forEach(function (r) {
      var f = $("#" + r.getAttribute("data-range"), box);
      r.addEventListener("input", function () { f.value = r.value; run(); });
      f.addEventListener("input", function () { r.value = f.value; run(); });
    });
    var used = false;
    box.addEventListener("input", function () { if (!used) { used = true; if (typeof track === "function") track("calculator_use", { page: location.pathname, type: "borrow" }); } });
    run();
  });

  /* ---------- Mortgage calculator ---------- */
  var fmt = function (n, dp) { return n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }); };
  $$("[data-calc]").forEach(function (calc) {
    var form = $("form", calc), price = $("[name=property-price]", calc), dep = $("[name=deposit]", calc), amt = $("[name=loan-amount]", calc),
        rate = $("[name=annual-rate]", calc), term = $("[name=loan-term]", calc), out = $("[data-out]", calc),
        loanOut = $("[data-loan]", calc), ltvOut = $("[data-ltv]", calc), pctOut = $("[data-dep-pct]", calc), onLoan = $("[data-on-loan]", calc),
        priceR = $("[data-range=c-price]", calc), depR = $("[data-range=c-dep]", calc),
        bal = $("[name=balance]", calc), balR = $("[data-range=c-bal]", calc);
    function compute() {
      // Buying: loan = price - deposit. Remortgaging: loan = amount left to pay (property value only gives the LTV)
      var remo = ((form.querySelector("[name=mode]:checked") || {}).value || "buy") === "remortgage";
      $$("[data-mode-show]", calc).forEach(function (el) { el.hidden = el.getAttribute("data-mode-show") !== (remo ? "remortgage" : "buy"); });
      var pr = parseFloat(price.value) || 0, d = Math.max(0, parseFloat(dep.value) || 0), P;
      if (remo) {
        P = Math.max(0, parseFloat(bal.value) || 0);
      } else {
        if (d > pr) d = pr;
        P = pr - d;
        depR.max = Math.max(pr, 0);
      }
      amt.value = P;
      loanOut.textContent = fmt(P, 0);
      // percentages to 1 decimal place when needed (10%, 10.4%) so they always match the £ figures
      var pct = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "%"; };
      pctOut.textContent = pr > 0 ? "(" + pct(d / pr * 100) + ")" : "";
      ltvOut.textContent = pr > 0 && P > 0 ? pct(P / pr * 100) + " loan to value" : "";
      var r = parseFloat(rate.value) / 100 / 12, n = parseFloat(term.value) * 12;
      var type = (form.querySelector("[name=type]:checked") || {}).value || "repayment";
      if (!(P > 0) || !(n > 0) || isNaN(r) || r < 0) { out.textContent = "-"; onLoan.textContent = ""; fit(); return; }
      var m = type === "interest" ? P * r : (r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n)));
      out.textContent = fmt(m, 2);
      onLoan.textContent = "on a loan of £" + fmt(P, 0) + " over " + term.value + " years";
      fit();
    }
    function link(input, range) {
      range.addEventListener("input", function () { input.value = range.value; compute(); });
      input.addEventListener("input", function () { range.value = input.value; });
    }
    link(price, priceR); link(dep, depR); link(bal, balR);
    // keep big figures inside the panel whatever the amount
    function fit() {
      var amt = out.parentNode, box = amt.parentNode;
      if (!box.clientWidth) return;  // not visible yet - refitted when it appears
      amt.style.fontSize = "";
      var avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
      var fs = parseFloat(getComputedStyle(amt).fontSize), guard = 0;
      while (amt.scrollWidth > avail && fs > 18 && guard++ < 40) { fs -= 2; amt.style.fontSize = fs + "px"; }
    }
    window.addEventListener("resize", fit);
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(out.parentNode.parentNode);
    form.addEventListener("input", compute);
    form.addEventListener("change", compute);
    form.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
    compute();
  });

  /* ---------- Form delivery (endpoint, or email-app fallback) ---------- */
  /* Lead source: first landing page, referrer and any UTM / ad click ids (kept for this visit) */
  var SRC_KEY = "qf-src", src = null;
  try { src = JSON.parse(sessionStorage.getItem(SRC_KEY) || "null"); } catch (e) {}
  if (!src) {
    var q = location.search, pick = function (k) { var m = q.match(new RegExp("[?&]" + k + "=([^&]+)")); return m ? decodeURIComponent(m[1]) : ""; };
    src = { landing: location.pathname, referrer: document.referrer || "direct", utm_source: pick("utm_source"), utm_medium: pick("utm_medium"),
            utm_campaign: pick("utm_campaign"), gclid: pick("gclid"), fbclid: pick("fbclid") };
    try { sessionStorage.setItem(SRC_KEY, JSON.stringify(src)); } catch (e) {}
  }
  function sourceLine() {
    var p = [src.utm_source && "utm_source=" + src.utm_source, src.utm_medium && "utm_medium=" + src.utm_medium,
             src.utm_campaign && "utm_campaign=" + src.utm_campaign, src.gclid && "Google Ads click", src.fbclid && "Facebook ad click"].filter(Boolean);
    return (p.length ? p.join(", ") + " | " : "") + "referrer: " + src.referrer + " | landed on: " + src.landing;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* Deliver an enquiry. With a Microsoft Power Automate / Logic App URL configured the
     enquiry is posted there (the flow emails it from Outlook). Otherwise the visitor's
     own email app opens with the enquiry pre-written to the office inbox. */
  function send(subject, fields, done, fail) {
    fields = fields.concat([["Sent from page", location.pathname], ["How they found us", sourceLine()]]);
    var CFG = window.QF_FORM || {};
    var get = function (re) { var f = fields.filter(function (x) { return re.test(x[0]); })[0]; return f ? f[1] : ""; };
    if (CFG.endpoint && /formspree\.io/.test(CFG.endpoint)) {
      // Formspree: one flat field per answer, so the email to the office lists them clearly.
      // "email" becomes the reply-to address, so replying goes straight to the client.
      var data = { _subject: subject, email: get(/email/i) };
      fields.forEach(function (f) { var k = f[0], n = 2; while (data[k] !== undefined) k = f[0] + " (" + n++ + ")"; data[k] = f[1]; });
      fetch(CFG.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); done(false); })
        .catch(function () { fail(); });
    } else if (CFG.endpoint) {
      var rows = fields.map(function (f) { return '<tr><td style="padding:6px 12px;background:#e3eff2;font-weight:600;vertical-align:top">' + esc(f[0]) + '</td><td style="padding:6px 12px">' + esc(f[1]).replace(/\n/g, "<br>") + "</td></tr>"; }).join("");
      var payload = {
        subject: subject,
        name: [get(/\(First\)$/), get(/\(Last\)$/)].filter(Boolean).join(" "),
        email: get(/email/i), phone: get(/phone|mobile/i),
        html: '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px"><h2 style="color:#1c4f60">' + esc(subject) + '</h2><table style="border-collapse:collapse">' + rows + "</table></div>",
        text: fields.map(function (f) { return f[0] + ": " + f[1]; }).join("\n"),
        fields: fields.map(function (f) { return { question: f[0], answer: f[1] }; }),
        submitted: new Date().toISOString()
      };
      var body = JSON.stringify(payload);
      fetch(CFG.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
        .then(function (r) { if (!r.ok) throw new Error(r.status); done(false); })
        .catch(function () {
          // fallback if the browser blocks the cross-site reply: send as a simple request
          fetch(CFG.endpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: body })
            .then(function () { done(false); }, function () { fail(); });
        });
    } else {
      var body = fields.map(function (f) { return f[0] + ": " + f[1]; }).join("\n");
      window.location.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      done(true);
    }
  }

  function valid(form) {
    var ok = true;
    $$("[required]", form).forEach(function (el) {
      var bad = el.type === "checkbox" ? !el.checked : !el.value.trim() || (el.type === "email" && !/^\S+@\S+\.\S+$/.test(el.value));
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad && ok) { el.focus(); ok = false; }
    });
    return ok;
  }
  function labelFor(el) {
    if (el.getAttribute("data-label")) return el.getAttribute("data-label");
    var l = el.id && $$('label[for="' + el.id + '"]').filter(function (x) { return !x.hidden; })[0];
    var t = l ? l.textContent.replace("*", "").trim() : el.name;
    var fs = el.closest("fieldset"); if (fs) t = $("legend", fs).textContent.replace("*", "").trim() + " (" + t + ")";
    return t;
  }

  $$("form[data-form]:not([data-hlq])").forEach(function (form) {
    var status = $(".form-status", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (isBot(form)) return;
      if (!valid(form)) { status.className = "form-status err"; status.textContent = "Please complete the required fields."; return; }
      var fields = $$("input,textarea,select", form).filter(function (el) { return el.value.trim() && el.name !== "qf_trap"; }).map(function (el) { return [labelFor(el), el.value.trim()]; });
      status.className = "form-status"; status.textContent = "Sending...";
      send(form.getAttribute("data-form") + " - quantockfinancial.co.uk", fields,
        function (mail) { track("generate_lead", { form_name: form.getAttribute("data-form"), delivery: mail ? "email_app" : "sent" }); status.textContent = mail ? "Your email app should now open with your message ready to send. If not, email " + EMAIL + " or call 01823 426046." : "Thank you - we have received your message and will be in touch."; if (!mail) form.reset(); },
        function () { status.className = "form-status err"; status.textContent = "Sorry, something went wrong. Please call 01823 426046 or email " + EMAIL + "."; });
    });
  });

  /* ---------- Health and lifestyle questionnaire ----------
     Single / joint switch, "Add another row" on the two tables, and its own collector:
     only ticked answers, no empty table rows, no Applicant 2 answers on a single
     application, every answer labelled section - question - applicant. */
  var hlq = $("form[data-hlq]");
  if (hlq) {
    var hlqStatus = $(".form-status", hlq);
    var hlqJoint = function () { var r = hlq.querySelector("[name=hlq_type]:checked"); return !!(r && r.value === "Joint application"); };
    var hlqMode = function () {
      var j = hlqJoint();
      hlq.classList.toggle("is-joint", j);
      $$(".a2 input, .a2 select, .a2 textarea", hlq).forEach(function (el) { el.disabled = !j; });
      $$("[data-joint-req]", hlq).forEach(function (el) { el.required = j; });
    };
    $$("[name=hlq_type]", hlq).forEach(function (el) { el.addEventListener("change", hlqMode); });
    hlqMode();
    // clear the red "required" highlight as soon as a missing field is filled in
    var hlqFixed = function (e) { var el = e.target; if (el.getAttribute("aria-invalid") === "true" && (el.type === "checkbox" ? el.checked : el.value.trim())) el.setAttribute("aria-invalid", "false"); };
    hlq.addEventListener("input", hlqFixed); hlq.addEventListener("change", hlqFixed);

    $$("[data-add-row]", hlq).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tbl = btn.closest("[data-table]"), box = $("[data-rows]", tbl), all = $$(".trow", box);
        var max = +tbl.getAttribute("data-max") || 8, k = all.length;
        if (k >= max) return;
        var row = all[0].cloneNode(true);
        $$("input, select", row).forEach(function (el) {
          el.value = el.tagName === "SELECT" ? el.options[0].value : "";
          el.id = el.id.replace(/-r\d+-/, "-r" + k + "-");
        });
        $$("label[for]", row).forEach(function (l) { l.setAttribute("for", l.getAttribute("for").replace(/-r\d+-/, "-r" + k + "-")); });
        box.appendChild(row);
        hlqMode();
        $("input", row).focus();
        if (k + 1 >= max) btn.hidden = true;
      });
    });

    var hlqCollect = function () {
      var j = hlqJoint(), apps = j ? [1, 2] : [1], out = [];
      var sec = function (el) { return el.closest("[data-sec]").getAttribute("data-sec"); };
      out.push(["Application type", j ? "Joint" : "Single"]);
      out.push(["Date submitted", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })]);
      out.push(["Email", $("#hlq-email").value.trim()]);
      if ($("#hlq-phone").value.trim()) out.push(["Phone number", $("#hlq-phone").value.trim()]);
      $$("[data-sec]", hlq).forEach(function (s) {
        var name = s.getAttribute("data-sec");
        $$(".hlq-row, .hlq-free, [data-conds], [data-table]", s).forEach(function (el) {
          if (el.matches(".hlq-row")) {
            apps.forEach(function (a) {
              var cell = $('.hlq-a[data-app="' + a + '"]', el), pick = $("input:checked", cell), box = $("input:not([type=radio]), textarea", cell);
              var v = pick ? pick.value : (box ? box.value.trim() : "");
              if (v) out.push([name + " - " + el.getAttribute("data-q") + " - Applicant " + a, v]);
            });
          } else if (el.matches(".hlq-free")) {
            var v = $("textarea", el).value.trim();
            if (v) out.push([name + " - " + el.getAttribute("data-q"), v]);
          } else if (el.matches("[data-conds]")) {
            apps.forEach(function (a) {
              var ticked = $$('[name="cond_' + a + '"]:checked', el).map(function (c) { return c.value; });
              if (ticked.length) out.push([name + " - " + el.getAttribute("data-conds") + " - Applicant " + a, ticked.join(", ")]);
            });
          } else {
            $$(".trow", el).forEach(function (row, i) {
              var cells = $$("[data-col]", row), who = j ? cells[0].value : "Applicant 1";
              var parts = cells.slice(1).filter(function (c) { return c.value.trim(); }).map(function (c) { return c.getAttribute("data-col") + ": " + c.value.trim(); });
              if (parts.length) out.push([name + " - " + el.getAttribute("data-table") + " " + (i + 1), who + " | " + parts.join(" | ")]);
            });
          }
        });
      });
      apps.forEach(function (a) { out.push(["Declaration - Applicant " + a, "Confirmed"]); });
      out.push(["Consent", "Agreed"]);
      return out;
    };

    hlq.addEventListener("submit", function (e) {
      e.preventDefault();
      if (isBot(hlq)) return;
      if (!valid(hlq)) { hlqStatus.className = "form-status err"; hlqStatus.textContent = "Please complete the required fields."; return; }
      hlqStatus.className = "form-status"; hlqStatus.textContent = "Sending...";
      var btn = $("[type=submit]", hlq); btn.disabled = true;
      send(hlq.getAttribute("data-form") + " - quantockfinancial.co.uk", hlqCollect(), function (mail) {
        track("generate_lead", { form_name: "Health and Lifestyle Questionnaire", delivery: mail ? "email_app" : "sent" });   // no answers in analytics
        if (mail) { btn.disabled = false; hlqStatus.textContent = "Your email app should now open with your answers ready to send. If not, email " + EMAIL + " or call 01823 426046."; return; }
        var done = $("[data-hlq-done]");
        hlq.hidden = true; $(".hlq-intro").hidden = true; $(".hlq-next").hidden = true;
        done.hidden = false; done.focus({ preventScroll: true }); $(".hlq-page").scrollIntoView({ block: "start" });
      }, function () {
        btn.disabled = false;
        hlqStatus.className = "form-status err"; hlqStatus.textContent = "Sorry, something went wrong. Please call 01823 426046 or email " + EMAIL + ".";
      });
    });
  }

  /* ---------- Enquiry quiz ---------- */
  var quiz = $("[data-quiz]");
  if (quiz) {
    var steps = $$(".step", quiz), qbar = $("[data-bar]"), count = $("[data-count]"), back = $("[data-back]");
    var history = [], cur = null;
    function goal() { var g = quiz.querySelector("[name=goal]:checked"); return g ? g.getAttribute("data-val") : ""; }
    function applicable(st) {
      var g = goal(), skip = st.getAttribute("data-skip"), only = st.getAttribute("data-only");
      if (skip && skip.split(" ").indexOf(g) > -1) return false;
      if (only && only.split(" ").indexOf(g) === -1) return false;
      return st.getAttribute("data-step") !== "done";
    }
    function path() { return steps.filter(applicable); }
    function show(st) {
      steps.forEach(function (s) { s.classList.toggle("active", s === st); });
      cur = st;
      track("quiz_step", { step_name: st.getAttribute("data-step"), step_number: path().indexOf(st) + 1 });
      var g = goal();
      $$("[data-when]", st).forEach(function (el) { el.hidden = el.getAttribute("data-when").split(" ").indexOf(g) === -1; });
      var p = path(), i = p.indexOf(st), done = st.getAttribute("data-step") === "done";
      qbar.style.width = (done ? 100 : Math.round((i + 0.3) / p.length * 100)) + "%";
      count.textContent = done ? "" : "Step " + (i + 1) + " of " + p.length;
      back.hidden = !history.length || done;
      var f = st.querySelector("input:not([type=radio]):not([type=checkbox]),textarea");
      if (f && window.innerWidth > 700) setTimeout(function () { f.focus({ preventScroll: true }); }, 350);
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
    function next() {
      var p = path(), i = p.indexOf(cur);
      if (i < p.length - 1) { history.push(cur); show(p[i + 1]); }
    }
    function stepValid(st) {
      var ok = true;
      $$("[data-req]", st).forEach(function (el) { if (!el.value.trim() && ok) { el.focus(); el.setAttribute("aria-invalid", "true"); ok = false; } });
      var radios = $$("input[type=radio]", st);
      if (radios.length && !radios.some(function (r) { return r.checked; })) ok = false;
      return ok;
    }
    quiz.addEventListener("change", function (e) {
      if (e.target.name === "goal" && !quiz._started) { quiz._started = true; track("quiz_start", { enquiry_type: e.target.value }); }
      if (e.target.type === "radio") {
        var st = e.target.closest(".step");
        // auto-advance on single-question steps
        if (!st.querySelector("[data-next]")) setTimeout(next, 220);
      }
    });
    $$("[data-next]", quiz).forEach(function (b) {
      b.addEventListener("click", function () {
        if (stepValid(cur)) next();
        else { var r = cur.querySelector(".choices"); if (r) r.style.animation = "stepIn .3s"; }
      });
    });
    back.addEventListener("click", function () { if (history.length) show(history.pop()); });
    quiz.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "radio" && cur.querySelector("[data-next]")) { e.preventDefault(); cur.querySelector("[data-next]").click(); }
    });
    quiz.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("[data-err]", quiz);
      if (isBot(quiz)) return;
      if (!valid(cur)) { err.textContent = "Please complete the required fields and tick the box to continue."; return; }
      err.textContent = "";
      var fields = [];
      path().forEach(function (st) {
        $$("input,textarea", st).forEach(function (el) {
          if (el.name === "qf_trap") return;
          if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
          if (!el.value.trim()) return;
          var q = el.closest("[data-q]");
          var k = el.type === "radio" ? (q ? q.getAttribute("data-q") : $("h2:not([hidden])", st).textContent) : (el.name === "consent" ? "Consent to contact" : labelFor(el));
          var val = el.value.trim();
          if (el.type === "number" && el.closest(".money")) val = "£" + Number(val).toLocaleString("en-GB");
          fields.push([k, val]);
        });
      });
      var btn = $("[type=submit]", quiz); btn.disabled = true; btn.textContent = "Sending...";
      send(ADV_SUBJECT(), fields, function (mail) {
        var g = quiz.querySelector("[name=goal]:checked");
        track("generate_lead", { form_name: "speak_to_an_advisor", enquiry_type: g ? g.value : "", delivery: mail ? "email_app" : "sent", currency: "GBP", value: 1 });
        var dl = $("[data-summary]"); dl.innerHTML = "";
        fields.forEach(function (f) { if (f[0] === "Consent to contact") return; var dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = f[0]; dd.textContent = f[1]; dl.appendChild(dt); dl.appendChild(dd); });
        if (mail) $("[data-done-msg]").textContent = "Your email app should now open with your answers ready to send to " + EMAIL + ". If it doesn't, please call us on 01823 426046.";
        var bk = (window.QF_FORM || {}).bookings, slot = $("[data-bookings]");
        if (bk && slot && !slot.querySelector("iframe")) {
          slot.hidden = false;
          slot.insertAdjacentHTML("beforeend", '<iframe src="' + bk + '" title="Book an appointment with Quantock Financial" loading="lazy"></iframe>');
          track("bookings_shown", {});
        }
        history = []; show($("[data-step=done]", quiz));
      }, function () { btn.disabled = false; btn.textContent = "Submit"; err.textContent = "Sorry, something went wrong. Please call 01823 426046 or email " + EMAIL + "."; });
    });
    function ADV_SUBJECT() { var g = quiz.querySelector("[name=goal]:checked"); return "Speak to an adviser - " + (g ? g.value : "enquiry"); }
    // Deep links from section pages: /enquiry?goal=protect&cover=ip skips the first question
    // (and pre-selects the cover). Works with ?… and, in the single-file preview, #enquiry?…
    function startFromLink() {
      var q = location.search + "&" + (location.hash.split("?")[1] || "");
      var g = (q.match(/[?&]goal=([a-z]+)/) || [])[1], c = (q.match(/[?&]cover=([a-z]+)/) || [])[1];
      $$("input[type=radio]", quiz).forEach(function (r) { r.checked = false; });
      history = [];
      var r = g && quiz.querySelector('[name=goal][data-key="' + g + '"]');
      if (!r) { show(steps[0]); return; }
      r.checked = true; history.push(steps[0]);
      var st = path()[1]; show(st);
      var cv = c && st.querySelector('[name=cover][data-key="' + c + '"]');
      if (cv) cv.checked = true;
    }
    startFromLink();
    // ---- leaving the form: close button, a click outside the card, or Esc ----
    var shell = quiz.closest(".quiz-shell"), leave = $("[data-quiz-leave]", quiz), PREVIEW = location.protocol === "file:";
    function typed() {
      return $$("input:not([type=radio]):not([type=checkbox]):not([name=qf_trap]),textarea", quiz)
        .some(function (el) { return el.value.trim(); });
    }
    function goBack() {
      track("quiz_exit", { step_name: cur ? cur.getAttribute("data-step") : "" });
      var same = document.referrer && document.referrer.indexOf(location.origin) === 0 && location.origin !== "null";
      if ((same || PREVIEW) && window.history.length > 1) window.history.back();
      else location.href = PREVIEW ? "#home" : "/";
    }
    function askLeave() {
      if (cur && cur.getAttribute("data-step") !== "done" && typed()) { leave.hidden = false; $("[data-leave-no]", leave).focus(); }
      else goBack();
    }
    $("[data-quiz-close]", quiz).addEventListener("click", function (e) { e.preventDefault(); askLeave(); });
    $("[data-leave-no]", leave).addEventListener("click", function () { leave.hidden = true; });
    $("[data-leave-yes]", leave).addEventListener("click", function () { leave.hidden = true; goBack(); });
    if (shell) shell.addEventListener("click", function (e) {
      var w = shell.querySelector(".quiz-wrap");
      if (e.target === shell || e.target === w) askLeave();   // empty space around the card only
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !quiz.offsetParent) return;
      if (!leave.hidden) leave.hidden = true; else askLeave();
    });
    window.addEventListener("hashchange", function () { if (/^#enquiry/.test(location.hash)) startFromLink(); });
    // clicking an option that is already selected (pre-selected, or after Back) still moves on
    quiz.addEventListener("click", function (e) {
      var r = e.target;   // a click on the label is re-sent to its input: only act on that one
      if (r.tagName !== "INPUT" || r.type !== "radio") return;
      if (r.checked && r._was && !r.closest(".step").querySelector("[data-next]")) { r._was = false; setTimeout(next, 220); }
    });
    quiz.addEventListener("pointerdown", function (e) {
      var t = e.target.closest("label.choice"); if (t) { var r = t.querySelector("input"); r._was = r.checked; }
    });
  }

  /* ---------- Cookie consent (Google Consent Mode v2) ---------- */
  var bar = $("#consent");
  function setConsent(v) {
    try { localStorage.setItem("qf-consent", v); } catch (e) {}
    if (window.gtag) gtag("consent", "update", { analytics_storage: v });
    if (v === "granted" && window.QF_CLARITY && !window.clarity) {
      (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, "clarity", "script", window.QF_CLARITY);
    }
    if (bar) bar.hidden = true;
    document.body.classList.remove("consent-showing");
  }
  var stored = null; try { stored = localStorage.getItem("qf-consent"); } catch (e) {}
  if (bar) {
    if (!stored) setTimeout(function () { bar.hidden = false; document.body.classList.add("consent-showing"); }, 900);
    else if (stored === "granted") setConsent("granted");
    $$("[data-consent]", bar).forEach(function (b) { b.addEventListener("click", function () { setConsent(b.getAttribute("data-consent")); }); });
  }
  $$("[data-consent-open]").forEach(function (b) { b.addEventListener("click", function () { if (bar) { bar.hidden = false; document.body.classList.add("consent-showing"); } }); });

  /* ---------- Analytics events (GA4) ---------- */
  function track(name, params) { if (window.gtag) gtag("event", name, params || {}); }
  window.qfTrack = track;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var h = a.getAttribute("href") || "", loc = a.getAttribute("data-loc") || (a.closest("header") ? "header" : a.closest("footer") ? "footer" : "page");
    if (/^tel:/.test(h)) track("click_call", { link_location: loc, page: location.pathname });
    else if (/whatsapp/.test(h)) track("click_whatsapp", { link_location: loc });
    else if (/^mailto:/.test(h)) track("click_email", { link_location: loc });
    else if (/enquiry/.test(h)) track("advisor_cta_click", { link_location: loc, page: location.pathname });
    else if (/checkmyfile/.test(h)) track("click_credit_report", {});
    else if (/google\.com\/maps/.test(h)) track("click_google_reviews", {});
  });
  var calcTracked = false;
  $$("[data-calc] form").forEach(function (f) {
    f.addEventListener("change", function () { if (!calcTracked) { calcTracked = true; track("calculator_use", { page: location.pathname }); } });
    f.addEventListener("submit", function () { track("calculator_calculate", { type: (f.querySelector("[name=type]:checked") || {}).value }); });
  });

  /* ---------- Testimonial carousel (arrows, dots, swipe, keyboard, gentle auto-advance) ---------- */
  $$("[data-carousel]").forEach(function (car) {
    var track = $(".track", car), slides = $$(".slide", car), dots = $$(".dot", car), i = 0, timer = null;
    function go(n, user) {
      i = (n + slides.length) % slides.length;
      track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: reduce ? "auto" : "smooth" });
      dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); });
      if (user) { stop(); if (window.gtag) gtag("event", "testimonial_click", { slide: i + 1 }); }
    }
    function stop() { clearInterval(timer); timer = null; }
    function start() { if (!reduce && !timer) timer = setInterval(function () { go(i + 1); }, 7000); }
    $("[data-prev]", car).addEventListener("click", function () { go(i - 1, true); });
    $("[data-next]", car).addEventListener("click", function () { go(i + 1, true); });
    dots.forEach(function (d) { d.addEventListener("click", function () { go(+d.getAttribute("data-go"), true); }); });
    track.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") go(i + 1, true); if (e.key === "ArrowLeft") go(i - 1, true); });
    // keep dots in sync when swiped
    var t; track.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(function () {
      var n = Math.round(track.scrollLeft / track.clientWidth); if (n !== i) { i = n; dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); }); }
    }, 120); }, { passive: true });
    ["mouseenter", "focusin", "touchstart"].forEach(function (ev) { car.addEventListener(ev, stop, { passive: true }); });
    car.addEventListener("mouseleave", start);
    dots[0] && dots[0].setAttribute("aria-current", "true");
    start();
  });

  /* ---------- Ask a question: answers ONLY from the website's own copy ---------- */
  (function () {
    var panel = $("#ask"); if (!panel) return;
    var log = $("[data-ask-log]", panel), form = $("[data-ask-form]", panel), input = $("#ask-q"), fabs = $$("[data-ask-open]");
    var TEL = "01823426046", WA = "https://api.whatsapp.com/send/?phone=447918612847";
    var STOP = " a an and are as at be been by can could do does for from get got have how i i'm if in into is it its me my of on or our so than that the their them then there these they this to up us was we what when where which who why will with would you your yours about any also just much many please tell know want need like should check help get give offer provide looking doing ".split(" ");
    var SYN = {
      btl: "buy let landlord", landlord: "buy let", buytolet: "buy let", remortgaging: "remortgage", remortgages: "remortgage", switch: "remortgage",
      ftb: "first time buyer", firsttime: "first time buyer", deposit: "deposit first time",
      cost: "fee charge", costs: "fee charge", price: "fee cost", charge: "fee", charges: "fee", fees: "fee", pay: "fee", free: "fee free", expensive: "fee",
      ci: "critical illness", illness: "critical illness", cancer: "critical illness", ip: "income protection", sick: "income protection illness",
      life: "life insurance", die: "life insurance death", death: "life insurance", equity: "lifetime later life", release: "lifetime later life", retired: "later life lifetime", pension: "later life",
      where: "address", located: "address", location: "address", based: "address taunton", office: "address", visit: "address", find: "address",
      phone: "telephone call", number: "telephone", ring: "call telephone", email: "email office", contact: "contact call email",
      stamp: "stamp duty sdlt", sdlt: "stamp duty", credit: "credit report score", score: "credit report", rating: "credit score",
      refer: "refer friend referral", referral: "refer friend", reward: "refer referral",
      nhs: "nhs health staff", nurse: "nhs", doctor: "nhs", complain: "ombudsman dispute", complaint: "ombudsman dispute",
      regulated: "financial conduct authority openwork", fca: "financial conduct authority", openwork: "openwork partnership",
      home: "property home", house: "property home", move: "moving house", moving: "moving house", buildings: "buildings content", contents: "content buildings",
      calculator: "calculator monthly payments", repayments: "repayment monthly payments", repossessed: "repossessed repayments",
      team: "neil william adviser", adviser: "adviser neil william", advisor: "adviser", advisers: "adviser", advisors: "adviser", neil: "neil hudson", will: "william", william: "william hudson"
    };
    function stem(w) {
      if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + "y";
      if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
      if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
      if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
      return w;
    }
    function toks(s) {
      return (s.toLowerCase().replace(/buy[- ]to[- ]let/g, "btl").replace(/first[- ]time/g, "firsttime").match(/[a-z0-9£]+/g) || [])
        .filter(function (w) { return STOP.indexOf(w) < 0 && w.length > 1; });
    }
    var docs = null, df = {}, avg = 0;
    function prep() {
      docs = (window.QF_QA || []).map(function (d) {
        var tf = {}, n = 0;
        function add(s, wgt) { toks(s).forEach(function (w) { w = stem(w); tf[w] = (tf[w] || 0) + wgt; n += wgt; }); }
        add(d.h, 3); add(d.t, 2); add(d.x, 1); if (d.k) add(d.k, 2);
        Object.keys(tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
        return { d: d, tf: tf, n: n };
      });
      avg = docs.reduce(function (a, b) { return a + b.n; }, 0) / (docs.length || 1);
    }
    function ensure(cb) {
      if (window.QF_QA) { if (!docs) prep(); return cb(); }
      var s = document.createElement("script"); s.src = "assets/js/qa-index.js";
      if (location.pathname.lastIndexOf("/") > 0) s.src = "/assets/js/qa-index.js";
      s.onload = function () { prep(); cb(); }; s.onerror = function () { docs = []; cb(); };
      document.head.appendChild(s);
    }
    function expand(q) {
      var base = toks(q), all = [];
      base.forEach(function (w) { all.push(w); if (SYN[w]) all = all.concat(SYN[w].split(" ")); });
      return { base: base.map(stem), all: all.map(stem) };
    }
    function search(q) {
      var e = expand(q), N = docs.length, res = [];
      docs.forEach(function (D) {
        var sc = 0, hit = 0;
        e.all.forEach(function (w, i) {
          var f = D.tf[w]; if (!f) return;
          var idf = Math.log(1 + (N - df[w] + .5) / (df[w] + .5));
          var wt = e.base.indexOf(w) > -1 ? 1 : .6;
          sc += wt * idf * (f * 2.2) / (f + 1.2 * (.25 + .75 * D.n / avg));
        });
        e.base.forEach(function (w) { if (D.tf[w] || (SYN[w] && SYN[w].split(" ").some(function (s) { return D.tf[stem(s)]; }))) hit++; });
        if (sc > 0) res.push({ D: D, sc: sc, cover: e.base.length ? hit / e.base.length : 0 });
      });
      res.sort(function (a, b) { return b.sc - a.sc; });
      return { res: res, terms: e.all };
    }
    function snippet(text, terms) {
      var sents = text.split(/(?<=[.!?]["’”]?)\s+(?=[A-Z0-9£“‘"(])/), best = 0, bi = 0;
      sents.forEach(function (s, i) {
        var w = toks(s).map(stem), sc = 0;
        terms.forEach(function (t) { if (w.indexOf(t) > -1) sc++; });
        if (sc > best) { best = sc; bi = i; }
      });
      var out = [], len = 0, i = Math.max(0, bi - (bi > 0 && sents[bi].length < 90 ? 1 : 0));
      for (; i < sents.length && (len < 260 || out.length < 1); i++) { out.push(sents[i].trim()); len += sents[i].length; }
      var start = sents.indexOf(sents[Math.max(0, bi - (bi > 0 && sents[bi].length < 90 ? 1 : 0))]);
      var html = esc(out.join(" "));
      terms.forEach(function (t) { if (t.length > 2) html = html.replace(new RegExp("\\b(" + t.replace(/[^a-z0-9]/g, "") + "[a-z]*)", "gi"), "<mark>$1</mark>"); });
      return (start > 0 ? "… " : "") + html + (i < sents.length ? " …" : "");
    }
    function add(cls, html) {
      var m = document.createElement("div"); m.className = "msg " + cls; m.innerHTML = html; log.appendChild(m);
      log.scrollTop = log.scrollHeight; return m;
    }
    var PREVIEW = location.protocol === "file:";
    function link(d) { return PREVIEW ? "#" + (d.p === "index.html" ? (d.u.split("#")[1] || "home") : d.p.slice(0, -5)) : d.u; }
    var contactActs = '<div class="acts"><a class="pri" href="' + (PREVIEW ? "#enquiry" : "/enquiry") + '" data-loc="ask">Speak to an adviser</a><a href="tel:' + TEL + '">Call 01823 426046</a><a href="mailto:' + EMAIL + '">Email us</a><a href="' + WA + '" target="_blank" rel="noopener">WhatsApp us</a></div>';
    function answer(q) {
      if (typeof markAsked === "function") markAsked(q);
      add("me", esc(q));
      var t = add("bot", '<span class="typing" aria-label="Searching"><span></span><span></span><span></span></span>');
      ensure(function () {
        setTimeout(function () {
          var r = search(q), nb = expand(q).base.length;
          var good = function (x) { return x.sc > 1.6 && (nb <= 3 ? x.cover === 1 : x.cover >= .75); };
          // best-scoring passage among the top few that actually covers the question
          var top = r.res.slice(0, 6).filter(function (x) { return good(x) && x.sc >= r.res[0].sc * .5; })[0];
          var ok = !!top;
          if (ok) {
            var d = top.D.d, seen = {}, also = [];
            seen[d.u] = 1;
            r.res.slice(1).forEach(function (x) { if (also.length < 2 && x.sc > top.sc * .55 && !seen[x.D.d.p + x.D.d.h] && x.D.d.p !== d.p) { seen[x.D.d.p + x.D.d.h] = 1; also.push(x.D.d); } });
            t.innerHTML = '<span class="src">' + esc(d.t + (d.h && d.h !== d.t ? " · " + d.h : "")) + "</span><p>" + snippet(d.x, r.terms) + "</p>" +
              '<a class="more" href="' + link(d) + '" data-ask-link>Read more &rarr;</a>' +
              (also.length ? '<p class="also">Also see: ' + also.map(function (a) { return '<a href="' + link(a) + '" data-ask-link>' + esc(a.t) + "</a>"; }).join(" · ") + "</p>" : "") +
              '<p class="also">Want to talk it through?</p>' + contactActs;
          } else {
            t.innerHTML = "<p>Sorry, I couldn't find an answer to that on our website. Our advisers will be happy to help:</p>" + contactActs;
          }
          var more = chipsHTML(3);
          if (more) t.insertAdjacentHTML("beforeend", '<p class="also" style="margin-top:.9rem">Other questions people ask:</p><div class="chips">' + more + "</div>");
          log.scrollTop = Math.max(0, t.offsetTop - log.offsetTop - 60);
          if (window.gtag) gtag("event", "ask_question", { answered: ok ? "yes" : "no", answer_page: ok ? top.D.d.p : "", page: location.pathname });
        }, 350);
      });
    }
    function open() {
      panel.hidden = false; fabs.forEach(function (f) { f.setAttribute("aria-expanded", "true"); });
      ensure(function () {}); setTimeout(function () { input.focus(); }, 50);
      if (window.gtag) gtag("event", "ask_open", { page: location.pathname });
    }
    function close() { panel.hidden = true; fabs.forEach(function (f) { f.setAttribute("aria-expanded", "false"); }); }
    fabs.forEach(function (f) { f.addEventListener("click", open); });
    $("[data-ask-close]", panel).addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); var q = input.value.trim(); if (!q) return; input.value = ""; answer(q); });
    // suggested questions: shown under the greeting and again (3 at a time) under every answer
    var SUGGEST = ["How much does mortgage advice cost?", "Can you help first-time buyers?", "What is income protection?",
                   "Do you do buy to let?", "Can I get equity release?", "Where are you based?", "Are you regulated?"];
    var asked = {};
    function markAsked(q) { asked[q.trim().toLowerCase()] = 1; }
    function chipsHTML(n) {
      return SUGGEST.filter(function (s) { return !asked[s.toLowerCase()]; }).slice(0, n)
        .map(function (s) { return '<button type="button" data-q>' + esc(s) + "</button>"; }).join("");
    }
    $("[data-ask-chips]", panel).innerHTML = chipsHTML(4);
    log.addEventListener("click", function (e) { var b = e.target.closest("button[data-q]"); if (b) answer(b.textContent); });
    log.addEventListener("click", function (e) { var a = e.target.closest("[data-ask-link], .acts a"); if (a && (PREVIEW || a.getAttribute("href").split("#")[0] === location.pathname)) close(); });
  })();
})();

/* ===== Photo swing on scroll (same motion as onthegroundproductions.com case studies) =====
   Each photo leans back up to 30deg on its vertical axis as it comes up the screen and
   straightens to face-on at centre. Photos on the left reveal left to right; photos on the
   right mirror them. Photos only - copy is never tilted. Desktop only; off for reduced motion.
   Performance: positions are read for every photo first, then all styles are written in one
   pass (no read/write interleaving = no forced layouts), and only photos near the screen move. */
(function () {
  var imgs = [].slice.call(document.querySelectorAll(".split-media img, .intro-media img, .team-member .photo img"));
  if (!imgs.length) return;
  var MAX = 30, raf = false, last = [];
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function paint() {
    raf = false;
    var vh = window.innerHeight || document.documentElement.clientHeight, vw = window.innerWidth;
    var off = vw < 900 || reduced, vals = [];
    for (var i = 0; i < imgs.length; i++) {           // read pass
      if (off) { vals.push(0); continue; }
      var r = imgs[i].getBoundingClientRect();
      if (!r.width || r.bottom < -100 || r.top > vh + 100) { vals.push(null); continue; }
      var p = Math.max(0, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh * 0.6)));
      var side = (r.left + r.width / 2) > vw / 2 ? 1 : -1;
      vals.push(Math.round(side * p * MAX * 10) / 10);
    }
    for (var k = 0; k < imgs.length; k++) {           // write pass (only when changed)
      var v = vals[k];
      if (v === null || v === last[k]) continue;
      last[k] = v;
      imgs[k].style.setProperty("--sy", v + "deg");
      imgs[k].style.setProperty("--sz", (1 + Math.abs(v) / MAX * 0.04).toFixed(3));
    }
  }
  function schedule() { if (!raf) { raf = true; requestAnimationFrame(paint); } }
  // set up after the page has loaded and the browser is idle - nothing above the fold needs it
  (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(function () {
    imgs.forEach(function (im) { im.classList.add("swing"); });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", function () { setTimeout(schedule, 60); });
    schedule();
  }, { timeout: 1500 });
})();

/* ===== Footer reveal (same as onthegroundproductions.com) =====
   The footer is fixed behind the page; the page keeps a gap the height of the footer
   and lifts away to reveal it. Only on when the whole footer fits in the window -
   otherwise (phones, short screens) the footer stays in normal flow so none of the
   regulatory text is hidden. Home page keeps a square bottom edge, like OTG. */
(function () {
  var m = document.querySelector("main"), f = document.querySelector(".site-footer");
  if (!m || !f) return;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setH() {
    var h = f.offsetHeight, fits = !reduced && h > 0 && h <= window.innerHeight - 40 && window.innerWidth >= 900;
    document.body.classList.toggle("reveal-on", fits);
    document.documentElement.style.setProperty("--qf-end-h", h + "px");
    var hero = m.querySelector(".hero");
    m.classList.toggle("flat", !!(hero && hero.offsetParent !== null));
  }
  // the footer is far below the first screen: measure it once the page is idle
  (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(setH, { timeout: 1500 });
  window.addEventListener("resize", setH);
  window.addEventListener("load", function () { setTimeout(setH, 400); });
  window.addEventListener("hashchange", function () { setTimeout(setH, 30); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(setH, 400); });
})();

/* ===== Menu: close the dropdown (and the mobile menu) once an item is picked ===== */
(function () {
  var cb = document.getElementById("nav-cb");
  document.querySelectorAll(".nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      var li = a.closest(".has-sub");
      if (li) {
        li.classList.add("just-picked");
        li.addEventListener("mouseleave", function off() { li.classList.remove("just-picked"); li.removeEventListener("mouseleave", off); });
        setTimeout(function () { if (!li.matches(":hover")) li.classList.remove("just-picked"); }, 900);
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
  });
  window.addEventListener("pageshow", function () {      // back/forward cache: never restore an open menu
    document.querySelectorAll(".has-sub.just-picked").forEach(function (li) { li.classList.remove("just-picked"); });
    if (cb) { cb.checked = false; document.body.classList.remove("nav-open", "nav-leaving"); }
  });
})();
