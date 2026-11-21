(() => {
  const TZ = "America/Chicago";
  const $ = id => document.getElementById(id);
  const fmt = n => n == null ? "—" : n.toLocaleString("en-US");
  const bust = "?v=" + Math.floor(Date.now() / 60000);

  const fmtCT = (iso, opts) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, ...opts });
  const checkedStr = iso => fmtCT(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT";

  function countUp(el, to, ms = 1800) {
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 4);
    const step = now => {
      const t = Math.min(1, (now - start) / ms);
      el.textContent = fmt(Math.round(to * ease(t)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // net change vs the newest history point at least `hours` old
  function deltaSince(hist, now, cur, hours) {
    const cutoff = now - hours * 3600e3;
    const base = [...hist].reverse().find(h => Date.parse(h.t) <= cutoff);
    if (!base) return null;
    return { d: cur - base.cybercab, base };
  }

  async function load() {
    const [latest, history] = await Promise.all([
      fetch("data/latest.json" + bust).then(r => r.json()),
      fetch("data/history.json" + bust).then(r => r.json()).catch(() => []),
    ]);
    const c = latest.counts, now = Date.parse(latest.checked_at);
    countUp($("cc-count"), c.cybercab);
    $("my-count").textContent = fmt(c.modely);
    $("total-count").textContent = fmt(c.total);
    const share = c.total ? (c.cybercab / c.total) * 100 : 0;
    $("share").textContent = share.toFixed(1) + "%";
    requestAnimationFrame(() => setTimeout(() => $("share-bar").style.width = share + "%", 100));
    $("checked").textContent = checkedStr(latest.checked_at);
    $("api-link").href = latest.source + "?limit=100&offset=0";

    const hist = history.slice().sort((a, b) => a.t.localeCompare(b.t));
    const d24 = deltaSince(hist, now, c.cybercab, 24);
    const d7 = deltaSince(hist, now, c.cybercab, 24 * 7);
    const sign = v => v == null ? "—" : (v.d > 0 ? "+" : "") + fmt(v.d);
    $("add-24").textContent = sign(d24);
    $("add-7").textContent = sign(d7);
    const d30 = deltaSince(hist, now, c.cybercab, 24 * 30);
    $("add-30").textContent = sign(d30);
    const oldest = d7 && d7.base && (now - Date.parse(d7.base.t) > 8 * 86400e3) ? d7.base : null;
    if (oldest) $("add-note").textContent = "Short windows compare with " + fmtCT(oldest.t, { month: "short", day: "numeric" }) + ", the closest earlier data point.";

    const chip = $("cc-delta");
    if (d24 && d24.d > 0) chip.textContent = "▲ " + fmt(d24.d) + " in the last 24 h";
    else if (d30 && d30.d > 0) chip.textContent = "▲ " + fmt(d30.d) + " in the last 30 days";
    else { chip.textContent = "No new Cybercabs in the last 24 h"; chip.classList.add("flat"); }

    // share on X
    const url = location.protocol.startsWith("http") && !/localhost|127\.0\.0\.1/.test(location.host) ? location.href.split("#")[0] : "";
    const text = `Cybercab count in Texas: ${fmt(c.cybercab)} 🚕 (${fmt(c.total)} robotaxis total)` + (url ? ` via ${url}` : "");
    $("share-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(text);

    drawChart(hist);
    feed(latest);
  }

  function drawChart(hist) {
    if (!window.Chart) return;
    const mk = (key) => hist.map(h => ({ x: Date.parse(h.t), y: h[key], bf: !!h.backfilled }));
    const ctx = $("chart").getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 340);
    g.addColorStop(0, "rgba(0,229,255,.35)"); g.addColorStop(1, "rgba(0,229,255,0)");
    const styleFor = color => ({
      pointBackgroundColor: c => c.raw && c.raw.bf ? "#05060a" : color,
      pointBorderColor: color, pointBorderWidth: 2,
      pointRadius: c => c.raw && c.raw.bf ? 4 : 5, pointHoverRadius: 7,
    });
    Chart.defaults.font.family = "Inter, sans-serif";
    Chart.defaults.color = "#8a93a6";
    new Chart(ctx, {
      type: "line",
      data: { datasets: [
        { label: "Cybercab", data: mk("cybercab"), borderColor: "#00e5ff", backgroundColor: g, fill: true, cubicInterpolationMode: "monotone", borderWidth: 3, ...styleFor("#00e5ff") },
        { label: "Model Y", data: mk("modely"), borderColor: "#ff3d71", backgroundColor: "transparent", cubicInterpolationMode: "monotone", borderWidth: 2, borderDash: [6, 5], ...styleFor("#ff3d71") },
      ]},
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: "#0b0d14", borderColor: "rgba(0,229,255,.4)", borderWidth: 1, padding: 12,
          titleFont: { family: "JetBrains Mono" }, bodyFont: { family: "JetBrains Mono" },
          callbacks: {
            title: items => fmtCT(items[0].parsed.x, { month: "short", day: "numeric", year: "numeric" }),
            label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y)}${i.raw.bf ? " (from X post)" : ""}`,
          } } },
        scales: {
          x: { type: "time", time: { unit: "week", tooltipFormat: "PP" }, grid: { color: "rgba(255,255,255,.05)" }, ticks: { maxRotation: 0 } },
          y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.05)" }, ticks: { callback: v => fmt(v) } },
        },
      },
    });
  }

  function feed(latest) {
    const serial = v => v.vin.slice(-6);
    const cabs = latest.vehicles.filter(v => v.type === "cybercab")
      .sort((a, b) => (b.first_seen.localeCompare(a.first_seen)) || serial(b).localeCompare(serial(a)));
    const anyNew = cabs.some(v => !v.initial);
    $("feed-note").textContent = anyNew
      ? "Newest first by the time this tracker first saw them, then by VIN serial number."
      : "Tracking just started, so these are sorted by VIN serial number (higher = built later). New registrations will show up here with the time they were first seen.";
    let shown = 12, q = "";
    const render = () => {
      const list = cabs.filter(v => v.vin.includes(q));
      $("feed").innerHTML = list.slice(0, shown).map(v => {
        const when = v.initial ? "on roster at launch" : "first seen " + fmtCT(v.first_seen, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const isNew = !v.initial && (Date.parse(latest.checked_at) - Date.parse(v.first_seen) < 86400e3);
        return `<li class="${isNew ? "new" : ""}"><span class="vin">${v.vin.slice(0, 8)}<em>${v.vin.slice(8)}</em></span><span class="when">${when}</span></li>`;
      }).join("") || `<li><span class="muted">No match</span></li>`;
      $("more").style.display = list.length > shown ? "flex" : "none";
    };
    $("more").onclick = () => { shown += 24; render(); };
    $("vin-search").oninput = e => { q = e.target.value.trim().toUpperCase(); shown = 12; render(); };
    render();
  }

  load().catch(err => {
    console.error(err);
    $("live-label").textContent = "DATA UNAVAILABLE";
  });
  // refresh every 10 minutes if the tab stays open
  setTimeout(() => location.reload(), 10 * 60e3);
})();
