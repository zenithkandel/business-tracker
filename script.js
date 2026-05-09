let DB = null;
let sortMode = "score";
let filteredBizList = [];
const bizMap = {};
const API_BASE = "controls.php";

let chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function loadData() {
    const raw = document.getElementById("json-textarea").value.trim();
    if (!raw) {
        showError("Paste JSON data first.");
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        initDashboard(parsed);
    } catch (e) {
        showError("Invalid JSON: " + e.message);
    }
}

document.getElementById("file-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            initDashboard(parsed);
        } catch (e) {
            showError("Could not parse file: " + e.message);
        }
    };
    reader.readAsText(file);
});

function showError(msg) {
    const el = document.getElementById("load-error");
    el.textContent = "ERROR: " + msg;
    el.style.display = "block";
}

function resetDashboard() {
    document.getElementById("dashboard").style.display = "none";
    document.getElementById("loader-screen").style.display = "flex";
    document.getElementById("json-textarea").value = "";
    document.getElementById("load-error").style.display = "none";
    DB = null;
    Object.keys(chartInstances).forEach(destroyChart);
    chartInstances = {};
}

function initDashboard(data) {
    DB = data;
    const businesses = data.businesses || [];
    businesses.forEach((b) => (bizMap[b.id] = b));
    filteredBizList = [...businesses];

    document.getElementById("loader-screen").style.display = "none";
    document.getElementById("dashboard").style.display = "block";

    const meta = data.metadata || {};
    document.getElementById("topbar-meta").textContent =
        `${meta.total_businesses || businesses.length} businesses · Generated ${meta.generated_at ? new Date(meta.generated_at).split("T")[0] : "N/A"}`;

    buildStats(businesses, meta);
    buildCharts(businesses);
    buildFilters(businesses);
    buildAnalysis(data.analysis || {}, businesses);
    renderGrid();
}

function buildStats(biz, meta) {
    const totalFollowers = biz.reduce((s, b) => s + (b.followers?.main_platform_count || 0), 0);
    const noWebsite = biz.filter((b) => !b.website?.exists).length;
    const highLeads = biz.filter((b) => b.lead_quality_score >= 8).length;
    const avgScore = biz.length
        ? (biz.reduce((s, b) => s + (b.lead_quality_score || 0), 0) / biz.length).toFixed(1)
        : 0;

    const stats = [
        { label: "Total Businesses", value: biz.length, sub: `${meta.nepal_count || 0} Nepal · ${meta.international_count || 0} International`, cls: "stat-accent" },
        { label: "No Website", value: noWebsite, sub: `${Math.round((noWebsite / biz.length) * 100)}% of total`, cls: "stat-yellow" },
        { label: "High-Quality Leads", value: highLeads, sub: "Score 8 or above", cls: "stat-green" },
        { label: "Avg Lead Score", value: avgScore, sub: "Out of 10", cls: "stat-purple" },
        { label: "Est. Total Reach", value: formatNum(totalFollowers), sub: "Combined followers", cls: "stat-accent" },
        { label: "Industries", value: new Set(biz.map((b) => b.industry_niche)).size, sub: "Unique niches", cls: "" },
    ];

    const grid = document.getElementById("stats-grid");
    grid.innerHTML = stats.map((s) => `
        <div class="stat-card">
            <div class="stat-label">${s.label}</div>
            <div class="stat-value ${s.cls}">${s.value}</div>
            <div class="stat-sub">${s.sub}</div>
        </div>`).join("");
}

function buildCharts(biz) {
    Object.keys(chartInstances).forEach(destroyChart);
    buildIndustryChart(biz);
    buildPlatformChart(biz);
    buildScoreChart(biz);
    buildWebsiteChart(biz);
}

function buildIndustryChart(biz) {
    const counts = {};
    biz.forEach((b) => {
        const k = b.industry_niche || "Other";
        counts[k] = (counts[k] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    destroyChart("industry");
    const ctx = document.getElementById("chart-industry").getContext("2d");
    chartInstances["industry"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: sorted.map(([k]) => k.split(" ").slice(0, 2).join(" ")),
            datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: "#C45C2C33", borderColor: "#C45C2C", borderWidth: 1.5, borderRadius: 0 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: "rgba(45,36,24,0.08)" }, ticks: { color: "#5C4A32", font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { color: "#5C4A32", font: { size: 10 } } },
            },
        },
    });
}

function buildPlatformChart(biz) {
    const counts = {};
    biz.forEach((b) => {
        const k = b.main_platform || "Other";
        counts[k] = (counts[k] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = ["#C45C2C", "#7B5EA7", "#3A7A7A", "#C4942C", "#B83A2B", "#ec4899", "#4A7C3F", "#f97316"];
    destroyChart("platform");
    const ctx = document.getElementById("chart-platform").getContext("2d");
    chartInstances["platform"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: sorted.map(([k]) => k),
            datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: colors.slice(0, sorted.length), borderColor: "#EDE5D0", borderWidth: 2 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: "62%",
            plugins: {
                legend: {
                    display: true, position: "bottom",
                    labels: { color: "#5C4A32", font: { size: 10 }, padding: 10, boxWidth: 10, boxHeight: 10 },
                },
            },
        },
    });
}

function buildScoreChart(biz) {
    const dist = Array(10).fill(0);
    biz.forEach((b) => {
        const s = Math.min(10, Math.max(1, Math.round(b.lead_quality_score || 0)));
        dist[s - 1]++;
    });
    const bgColors = dist.map((_, i) => i >= 7 ? "#4A7C3F33" : i >= 4 ? "#C4942C33" : "#B83A2B33");
    const brColors = dist.map((_, i) => i >= 7 ? "#4A7C3F" : i >= 4 ? "#C4942C" : "#B83A2B");
    destroyChart("scores");
    const ctx = document.getElementById("chart-scores").getContext("2d");
    chartInstances["scores"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
            datasets: [{ data: dist, backgroundColor: bgColors, borderColor: brColors, borderWidth: 1.5, borderRadius: 0 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#5C4A32", font: { size: 10 } } },
                y: { grid: { color: "rgba(45,36,24,0.08)" }, ticks: { color: "#5C4A32", font: { size: 10 }, precision: 0 } },
            },
        },
    });
}

function buildWebsiteChart(biz) {
    const hasWeb = biz.filter((b) => b.website?.exists).length;
    const noWeb = biz.length - hasWeb;
    const highConv = biz.filter((b) => b.conversion_potential === "High").length;
    const medConv = biz.filter((b) => b.conversion_potential === "Medium").length;
    const lowConv = biz.filter((b) => b.conversion_potential === "Low").length;
    destroyChart("website");
    const ctx = document.getElementById("chart-website").getContext("2d");
    chartInstances["website"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["No Website", "Has Website", "High Conv.", "Med Conv.", "Low Conv."],
            datasets: [{
                data: [noWeb, hasWeb, highConv, medConv, lowConv],
                backgroundColor: ["#B83A2B33", "#4A7C3F33", "#C45C2C33", "#C4942C33", "#6B728033"],
                borderColor: ["#B83A2B", "#4A7C3F", "#C45C2C", "#C4942C", "#6B7280"],
                borderWidth: 1.5, borderRadius: 0,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#5C4A32", font: { size: 10 } } },
                y: { grid: { color: "rgba(45,36,24,0.08)" }, ticks: { color: "#5C4A32", font: { size: 10 }, precision: 0 } },
            },
        },
    });
}

function buildFilters(biz) {
    const countries = [...new Set(biz.map((b) => b.country).filter(Boolean))].sort();
    const industries = [...new Set(biz.map((b) => b.industry_niche).filter(Boolean))].sort();
    const platforms = [...new Set(biz.map((b) => b.main_platform).filter(Boolean))].sort();
    populateSelect("filter-country", countries);
    populateSelect("filter-industry", industries);
    populateSelect("filter-platform", platforms);
}

function populateSelect(id, options) {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="">All</option>';
    options.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        el.appendChild(opt);
    });
}

function applyFilters() {
    const search = document.getElementById("search-input").value.toLowerCase();
    const country = document.getElementById("filter-country").value;
    const industry = document.getElementById("filter-industry").value;
    const platform = document.getElementById("filter-platform").value;
    const website = document.getElementById("filter-website").value;
    const minScore = parseInt(document.getElementById("filter-score").value) || 0;
    const biz = DB.businesses || [];

    filteredBizList = biz.filter((b) => {
        if (search && !`${b.business_name}${b.description}${b.city_region}${b.founder_owner}`.toLowerCase().includes(search)) return false;
        if (country && b.country !== country) return false;
        if (industry && b.industry_niche !== industry) return false;
        if (platform && b.main_platform !== platform) return false;
        if (website === "no" && b.website?.exists) return false;
        if (website === "yes" && !b.website?.exists) return false;
        if ((b.lead_quality_score || 0) < minScore) return false;
        return true;
    });
    renderGrid();
}

function setSortMode(mode) {
    sortMode = mode;
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    document.getElementById("sort-" + mode).classList.add("active");
    renderGrid();
}

function renderGrid() {
    const sorted = [...filteredBizList].sort((a, b) => {
        if (sortMode === "score") return (b.lead_quality_score || 0) - (a.lead_quality_score || 0);
        if (sortMode === "name") return (a.business_name || "").localeCompare(b.business_name || "");
        if (sortMode === "followers") return (b.followers?.main_platform_count || 0) - (a.followers?.main_platform_count || 0);
        return 0;
    });

    const grid = document.getElementById("biz-grid");
    document.getElementById("filter-count").textContent = `${sorted.length} results`;

    if (!sorted.length) {
        grid.innerHTML = '<div class="no-results">No businesses match your filters.</div>';
        return;
    }
    grid.innerHTML = sorted.map((b) => bizCard(b)).join("");
}

function bizCard(b) {
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? "score-high" : score >= 5 ? "score-med" : "score-low";
    const engCls = b.engagement_quality === "High" ? "eng-high" : b.engagement_quality === "Medium" ? "eng-med" : "eng-low";
    const webTag = b.website?.exists ? `<span class="tag tag-has-site">Has Website</span>` : `<span class="tag tag-no-site">No Website</span>`;
    const signals = (b.website_need_signals || []).slice(0, 3);
    const followersText = b.followers?.main_platform_label || (b.followers?.main_platform_count ? formatNum(b.followers.main_platform_count) : "—");

    return `<div class="biz-card" data-id="${b.id}">
        <div class="biz-card-header">
            <div>
                <div class="biz-name">${esc(b.business_name)}</div>
                <div class="biz-location">${esc(b.city_region || "")}, ${esc(b.country || "")}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div class="score-badge ${scoreCls}">${score}</div>
                <div class="biz-actions">
                    <button onclick="event.stopPropagation();openEditForm('${b.id}')" title="Edit">&#9998;</button>
                    <button class="delete-btn" onclick="event.stopPropagation();confirmDelete('${b.id}')" title="Delete">&#10005;</button>
                </div>
            </div>
        </div>
        <div class="biz-tags">
            ${b.industry_niche ? `<span class="tag tag-industry">${esc(b.industry_niche)}</span>` : ""}
            ${b.main_platform ? `<span class="tag tag-platform">${esc(b.main_platform)}</span>` : ""}
            ${b.business_maturity ? `<span class="tag tag-maturity">${esc(b.business_maturity)}</span>` : ""}
            ${webTag}
        </div>
        <div class="biz-desc">${esc(b.description || "")}</div>
        <div class="biz-meta-row">
            <span class="biz-followers">&#128101; ${followersText}</span>
            <span class="biz-engagement"><span class="eng-dot ${engCls}"></span>${b.engagement_quality || "—"} engagement</span>
            <span>${b.suggested_website_type || ""}</span>
        </div>
        ${signals.length ? `<div class="biz-signals">
            <div class="signals-label">Why they need a website</div>
            ${signals.map((s) => `<span class="signal-pill">${esc(s)}</span>`).join("")}
        </div>` : ""}
    </div>`;
}

function openModal(id) {
    const b = bizMap[id];
    if (!b) return;
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? "score-high" : score >= 5 ? "score-med" : "score-low";

    document.getElementById("modal-title").textContent = b.business_name || "Unknown Business";
    document.getElementById("modal-subtitle").textContent = `${b.id} · ${b.industry_niche || ""} · ${b.city_region || ""}, ${b.country || ""}`;

    const mainLink = (b.social_links || {})[b.main_platform?.toLowerCase()] || null;

    const contactRows = [];
    if (b.contact?.email) contactRows.push({ icon: "&#128231;", type: "Email", val: `<a href="mailto:${esc(b.contact.email)}">${esc(b.contact.email)}</a>` });
    if (b.contact?.whatsapp) contactRows.push({ icon: "&#128172;", type: "WhatsApp", val: esc(b.contact.whatsapp) });
    if (b.contact?.phone) contactRows.push({ icon: "&#128222;", type: "Phone", val: esc(b.contact.phone) });
    if (!contactRows.length) contactRows.push({ icon: "&#128236;", type: "Best method", val: esc(b.contact?.best_method || "Instagram DM") });

    const platformLinks = Object.entries(b.social_links || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `<div class="platform-chip"><a href="${esc(v)}" target="_blank">${k.charAt(0).toUpperCase() + k.slice(1)} &#8599;</a></div>`)
        .join("");

    const payCapColor = b.payment_capacity === "High" ? "#4A7C3F" : b.payment_capacity === "Medium" ? "#C4942C" : "#B83A2B";
    const convColor = b.conversion_potential === "High" ? "#4A7C3F" : b.conversion_potential === "Medium" ? "#C4942C" : "#B83A2B";

    document.getElementById("modal-body").innerHTML = `
        <div>
            <div class="modal-section-title">Scores & Potential</div>
            <div class="score-row">
                <div class="score-item">
                    <div class="score-ring ${scoreCls}">${score}</div>
                    <div class="score-ring-label">Lead Score</div>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                    <div class="modal-field">
                        <div class="modal-field-label">Conversion potential</div>
                        <div class="modal-field-value" style="color:${convColor}">${b.conversion_potential || "—"}</div>
                    </div>
                    <div class="modal-field">
                        <div class="modal-field-label">Payment capacity</div>
                        <div class="modal-field-value" style="color:${payCapColor}">${b.payment_capacity || "—"}</div>
                    </div>
                </div>
            </div>
        </div>
        <div>
            <div class="modal-section-title">Business Details</div>
            <div class="modal-grid">
                <div class="modal-field"><div class="modal-field-label">Industry</div><div class="modal-field-value">${esc(b.industry_niche || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Business maturity</div><div class="modal-field-value">${esc(b.business_maturity || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Posting frequency</div><div class="modal-field-value">${esc(b.posting_frequency || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Engagement quality</div><div class="modal-field-value">${esc(b.engagement_quality || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Main platform</div><div class="modal-field-value">${mainLink ? `<a href="${esc(mainLink)}" target="_blank">${esc(b.main_platform || "—")} &#8599;</a>` : esc(b.main_platform || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Followers (main)</div><div class="modal-field-value">${b.followers?.main_platform_label || formatNum(b.followers?.main_platform_count) || "—"}</div></div>
                <div class="modal-field"><div class="modal-field-label">Suggested website</div><div class="modal-field-value">${esc(b.suggested_website_type || "—")}</div></div>
                <div class="modal-field"><div class="modal-field-label">Founder/Owner</div><div class="modal-field-value ${b.founder_owner ? "" : "null-val"}">${esc(b.founder_owner || "Unknown")}</div></div>
            </div>
        </div>
        ${b.description ? `<div><div class="modal-section-title">Description</div><div class="obs-box" style="border-color:var(--purple)">${esc(b.description)}</div></div>` : ""}
        <div>
            <div class="modal-section-title">Website Analysis</div>
            <div class="modal-grid">
                <div class="modal-field"><div class="modal-field-label">Website exists</div><div class="modal-field-value" style="color:${b.website?.exists ? "var(--green)" : "var(--red)"}">${b.website?.exists ? "&#10003; Yes" : "&#10005; No"}</div></div>
                ${b.website?.url ? `<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value"><a href="${esc(b.website.url)}" target="_blank">${esc(b.website.url)} &#8599;</a></div></div>` : '<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value null-val">None found</div></div>'}
                ${b.website?.quality_score != null ? `<div class="modal-field"><div class="modal-field-label">Quality score</div><div class="modal-field-value">${b.website.quality_score}/10</div></div>` : ""}
            </div>
            ${b.website?.quality_analysis ? `<div class="obs-box" style="margin-top:8px;border-color:var(--red);font-size:12px">${esc(b.website.quality_analysis)}</div>` : ""}
        </div>
        ${(b.website_need_signals || []).length ? `<div>
            <div class="modal-section-title">Why they need a website</div>
            <div class="signals-list">${(b.website_need_signals || []).map((s) => `<div class="signal-item">&#9888; ${esc(s)}</div>`).join("")}</div>
        </div>` : ""}
        <div>
            <div class="modal-section-title">Contact Information</div>
            ${contactRows.map((r) => `<div class="contact-row"><div class="contact-icon">${r.icon}</div><div class="contact-info"><div class="contact-type">${r.type}</div><div class="contact-val">${r.val}</div></div></div>`).join("")}
            <div style="margin-top:6px;font-size:11px;color:var(--text3)">Best contact method: <strong style="color:var(--text2)">${esc(b.contact?.best_method || "—")}</strong></div>
        </div>
        ${platformLinks ? `<div><div class="modal-section-title">All social platforms</div><div class="platforms-list">${platformLinks}</div></div>` : ""}
        ${b.observations ? `<div><div class="modal-section-title">Analyst observations</div><div class="obs-box">${esc(b.observations)}</div></div>` : ""}
    `;
    document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
    document.getElementById("modal-overlay").classList.remove("open");
}

function closeModalOnBg(e) {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});

function buildAnalysis(analysis, biz) {
    const grid = document.getElementById("analysis-grid");
    const cards = [];

    function topListCard(title, icon, ids, colorClass) {
        if (!ids || !ids.length) return "";
        const items = ids.map((id, i) => {
            const b = bizMap[id];
            if (!b) return "";
            return `<div class="top-biz-item" onclick="openModal('${id}')">
                <span class="top-biz-rank">#${i + 1}</span>
                <span class="top-biz-name">${esc(b.business_name)}</span>
                <span class="top-biz-score" style="color:${colorClass}">${b.lead_quality_score || "—"}</span>
            </div>`;
        }).join("");
        return `<div class="analysis-card">
            <div class="analysis-card-title"><span class="icon">${icon}</span>${title}</div>
            <div class="top-biz-list">${items || '<div style="color:var(--text3);font-size:12px">No data</div>'}</div>
        </div>`;
    }

    cards.push(topListCard("Top 15 Highest Potential", "&#127942;", analysis.top_15_highest_potential, "var(--green)"));
    cards.push(topListCard("Easiest to Approach", "&#128075;", analysis.top_10_easiest_approach, "var(--teal)"));
    cards.push(topListCard("Most Likely to Pay", "&#128176;", analysis.top_10_likely_to_pay, "var(--yellow)"));
    cards.push(topListCard("Best for E-Commerce", "&#128722;", analysis.top_10_ecommerce, "var(--purple)"));
    cards.push(topListCard("Best for SEO + AdSense", "&#128200;", analysis.top_10_seo_adsense, "var(--accent)"));
    cards.push(topListCard("Most Underserved Digitally", "&#127760;", analysis.most_underserved_digital, "var(--pink)"));
    cards.push(topListCard("Fastest Growth Signals", "&#128640;", analysis.fastest_growth_signals, "var(--orange)"));

    if ((analysis.common_patterns || []).length) {
        cards.push(`<div class="analysis-card">
            <div class="analysis-card-title"><span class="icon">&#128269;</span>Common patterns discovered</div>
            <div class="pattern-list">${analysis.common_patterns.map((p) => `<div class="pattern-item">${esc(p)}</div>`).join("")}</div>
        </div>`);
    }

    if ((analysis.biggest_problems || []).length) {
        cards.push(`<div class="analysis-card">
            <div class="analysis-card-title"><span class="icon">&#9888;</span>Biggest website problems</div>
            <div class="pattern-list">${analysis.biggest_problems.map((p) => `<div class="problem-item">${esc(p)}</div>`).join("")}</div>
        </div>`);
    }

    if ((analysis.outreach_strategies || []).length) {
        cards.push(`<div class="analysis-card">
            <div class="analysis-card-title"><span class="icon">&#128227;</span>Best outreach strategies</div>
            <div class="strategy-list">${analysis.outreach_strategies.map((p) => `<div class="strategy-item">${esc(p)}</div>`).join("")}</div>
        </div>`);
    }

    if ((analysis.best_industries_to_target_first || []).length) {
        cards.push(`<div class="analysis-card">
            <div class="analysis-card-title"><span class="icon">&#127919;</span>Best industries to target first</div>
            <div>${analysis.best_industries_to_target_first.map((i) => `<span class="industry-pill">${esc(i)}</span>`).join("")}</div>
        </div>`);
    }

    if (analysis.approach_strategy_for_beginners) {
        cards.push(`<div class="analysis-card" style="grid-column:1/-1">
            <div class="analysis-card-title"><span class="icon">&#128161;</span>How to approach as a beginner freelancer</div>
            <div class="approach-box">${esc(analysis.approach_strategy_for_beginners)}</div>
        </div>`);
    }

    grid.innerHTML = cards.filter(Boolean).join("");
}

function esc(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatNum(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
}

function showToast(msg, type) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.className = "toast " + type;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
}

let editingId = null;

function toggleEditForm() {
    const section = document.getElementById("edit-form-section");
    section.classList.toggle("active");
    if (!section.classList.contains("active")) {
        resetEditForm();
    }
}

function resetEditForm() {
    editingId = null;
    document.getElementById("edit-form-section").classList.remove("active");
    document.getElementById("edit-id").value = "";
    document.getElementById("edit-business_name").value = "";
    document.getElementById("edit-country").value = "";
    document.getElementById("edit-city_region").value = "";
    document.getElementById("edit-industry_niche").value = "";
    document.getElementById("edit-description").value = "";
    document.getElementById("edit-main_platform").value = "";
    document.getElementById("edit-other_platforms").value = "";
    document.getElementById("edit-instagram").value = "";
    document.getElementById("edit-facebook").value = "";
    document.getElementById("edit-tiktok").value = "";
    document.getElementById("edit-youtube").value = "";
    document.getElementById("edit-linkedin").value = "";
    document.getElementById("edit-followers_main").value = "";
    document.getElementById("edit-engagement_quality").value = "";
    document.getElementById("edit-posting_frequency").value = "";
    document.getElementById("edit-website_exists").value = "";
    document.getElementById("edit-website_url").value = "";
    document.getElementById("edit-website_need_signals").value = "";
    document.getElementById("edit-suggested_website_type").value = "";
    document.getElementById("edit-business_maturity").value = "";
    document.getElementById("edit-email").value = "";
    document.getElementById("edit-phone").value = "";
    document.getElementById("edit-whatsapp").value = "";
    document.getElementById("edit-best_method").value = "";
    document.getElementById("edit-founder_owner").value = "";
    document.getElementById("edit-lead_quality_score").value = "";
    document.getElementById("edit-conversion_potential").value = "";
    document.getElementById("edit-payment_capacity").value = "";
    document.getElementById("edit-observations").value = "";
}

function openEditForm(id) {
    const b = bizMap[id];
    if (!b) return;
    editingId = id;

    document.getElementById("edit-form-section").classList.add("active");
    document.getElementById("edit-id").value = b.id || "";
    document.getElementById("edit-business_name").value = b.business_name || "";
    document.getElementById("edit-country").value = b.country || "";
    document.getElementById("edit-city_region").value = b.city_region || "";
    document.getElementById("edit-industry_niche").value = b.industry_niche || "";
    document.getElementById("edit-description").value = b.description || "";
    document.getElementById("edit-main_platform").value = b.main_platform || "";
    document.getElementById("edit-other_platforms").value = (b.other_platforms || []).join(", ");
    document.getElementById("edit-instagram").value = b.social_links?.instagram || "";
    document.getElementById("edit-facebook").value = b.social_links?.facebook || "";
    document.getElementById("edit-tiktok").value = b.social_links?.tiktok || "";
    document.getElementById("edit-youtube").value = b.social_links?.youtube || "";
    document.getElementById("edit-linkedin").value = b.social_links?.linkedin || "";
    document.getElementById("edit-followers_main").value = b.followers?.main_platform_count || "";
    document.getElementById("edit-engagement_quality").value = b.engagement_quality || "";
    document.getElementById("edit-posting_frequency").value = b.posting_frequency || "";
    document.getElementById("edit-website_exists").value = b.website?.exists ? "yes" : "no";
    document.getElementById("edit-website_url").value = b.website?.url || "";
    document.getElementById("edit-website_need_signals").value = (b.website_need_signals || []).join("|");
    document.getElementById("edit-suggested_website_type").value = b.suggested_website_type || "";
    document.getElementById("edit-business_maturity").value = b.business_maturity || "";
    document.getElementById("edit-email").value = b.contact?.email || "";
    document.getElementById("edit-phone").value = b.contact?.phone || "";
    document.getElementById("edit-whatsapp").value = b.contact?.whatsapp || "";
    document.getElementById("edit-best_method").value = b.contact?.best_method || "";
    document.getElementById("edit-founder_owner").value = b.founder_owner || "";
    document.getElementById("edit-lead_quality_score").value = b.lead_quality_score || "";
    document.getElementById("edit-conversion_potential").value = b.conversion_potential || "";
    document.getElementById("edit-payment_capacity").value = b.payment_capacity || "";
    document.getElementById("edit-observations").value = b.observations || "";

    document.getElementById("edit-form-section").scrollIntoView({ behavior: "smooth" });
}

function submitEdit() {
    if (!editingId) return;

    const updated = {
        id: editingId,
        business_name: document.getElementById("edit-business_name").value.trim(),
        country: document.getElementById("edit-country").value.trim(),
        city_region: document.getElementById("edit-city_region").value.trim(),
        industry_niche: document.getElementById("edit-industry_niche").value.trim(),
        description: document.getElementById("edit-description").value.trim(),
        main_platform: document.getElementById("edit-main_platform").value.trim(),
        other_platforms: document.getElementById("edit-other_platforms").value.split(",").map(s => s.trim()).filter(Boolean),
        social_links: {
            instagram: document.getElementById("edit-instagram").value.trim() || null,
            facebook: document.getElementById("edit-facebook").value.trim() || null,
            tiktok: document.getElementById("edit-tiktok").value.trim() || null,
            youtube: document.getElementById("edit-youtube").value.trim() || null,
            twitter: null,
            linkedin: document.getElementById("edit-linkedin").value.trim() || null,
            linktree: null,
            other: null,
        },
        followers: {
            main_platform_count: parseInt(document.getElementById("edit-followers_main").value) || 0,
            main_platform_label: formatNum(parseInt(document.getElementById("edit-followers_main").value) || 0),
            total_estimated: parseInt(document.getElementById("edit-followers_main").value) || 0,
        },
        engagement_quality: document.getElementById("edit-engagement_quality").value.trim(),
        posting_frequency: document.getElementById("edit-posting_frequency").value.trim(),
        website: {
            exists: document.getElementById("edit-website_exists").value === "yes",
            url: document.getElementById("edit-website_url").value.trim() || null,
            quality_score: null,
            quality_analysis: null,
        },
        website_need_signals: document.getElementById("edit-website_need_signals").value.split("|").map(s => s.trim()).filter(Boolean),
        suggested_website_type: document.getElementById("edit-suggested_website_type").value.trim(),
        business_maturity: document.getElementById("edit-business_maturity").value.trim(),
        contact: {
            email: document.getElementById("edit-email").value.trim() || null,
            phone: document.getElementById("edit-phone").value.trim() || null,
            whatsapp: document.getElementById("edit-whatsapp").value.trim() || null,
            best_method: document.getElementById("edit-best_method").value.trim(),
        },
        founder_owner: document.getElementById("edit-founder_owner").value.trim() || null,
        lead_quality_score: parseInt(document.getElementById("edit-lead_quality_score").value) || 0,
        conversion_potential: document.getElementById("edit-conversion_potential").value.trim(),
        payment_capacity: document.getElementById("edit-payment_capacity").value.trim(),
        observations: document.getElementById("edit-observations").value.trim(),
    };

    const formData = new FormData();
    formData.append("action", "update_business");
    formData.append("business_id", editingId);
    formData.append("data", JSON.stringify(updated));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE, true);
    xhr.onload = function () {
        if (xhr.status === 200 && xhr.responseText.trim() === "OK") {
            bizMap[editingId] = updated;
            const bizIndex = DB.businesses.findIndex(b => b.id === editingId);
            if (bizIndex !== -1) DB.businesses[bizIndex] = updated;
            buildCharts(DB.businesses);
            renderGrid();
            resetEditForm();
            showToast("Business updated successfully.", "success");
        } else {
            showToast("Update failed: " + (xhr.responseText || "Server error"), "error");
        }
    };
    xhr.onerror = function () {
        showToast("Network error. Please try again.", "error");
    };
    xhr.send(formData);
}

function confirmDelete(id) {
    if (!confirm("Are you sure you want to delete this business entry?")) return;

    const formData = new FormData();
    formData.append("action", "delete_business");
    formData.append("business_id", id);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE, true);
    xhr.onload = function () {
        if (xhr.status === 200 && xhr.responseText.trim() === "OK") {
            delete bizMap[id];
            DB.businesses = DB.businesses.filter(b => b.id !== id);
            filteredBizList = filteredBizList.filter(b => b.id !== id);
            buildCharts(DB.businesses);
            renderGrid();
            showToast("Business deleted successfully.", "success");
        } else {
            showToast("Delete failed: " + (xhr.responseText || "Server error"), "error");
        }
    };
    xhr.onerror = function () {
        showToast("Network error. Please try again.", "error");
    };
    xhr.send(formData);
}

function addNewBusiness() {
    editingId = null;
    document.getElementById("edit-id").value = "";
    resetEditForm();
    document.getElementById("edit-form-section").classList.add("active");
    document.getElementById("edit-form-section").scrollIntoView({ behavior: "smooth" });
}

function submitNew() {
    const business_name = document.getElementById("edit-business_name").value.trim();
    if (!business_name) {
        showToast("Business name is required.", "error");
        return;
    }

    const maxId = DB.businesses.reduce((max, b) => {
        const num = parseInt(b.id.replace("BIZ_", ""));
        return num > max ? num : max;
    }, 0);
    const newId = "BIZ_" + String(maxId + 1).padStart(3, "0");

    const newBusiness = {
        id: newId,
        business_name: business_name,
        country: document.getElementById("edit-country").value.trim() || "Nepal",
        city_region: document.getElementById("edit-city_region").value.trim() || "",
        industry_niche: document.getElementById("edit-industry_niche").value.trim() || "",
        description: document.getElementById("edit-description").value.trim() || "",
        main_platform: document.getElementById("edit-main_platform").value.trim() || "Instagram",
        other_platforms: document.getElementById("edit-other_platforms").value.split(",").map(s => s.trim()).filter(Boolean),
        social_links: {
            instagram: document.getElementById("edit-instagram").value.trim() || null,
            facebook: document.getElementById("edit-facebook").value.trim() || null,
            tiktok: document.getElementById("edit-tiktok").value.trim() || null,
            youtube: document.getElementById("edit-youtube").value.trim() || null,
            twitter: null,
            linkedin: document.getElementById("edit-linkedin").value.trim() || null,
            linktree: null,
            other: null,
        },
        followers: {
            main_platform_count: parseInt(document.getElementById("edit-followers_main").value) || 0,
            main_platform_label: formatNum(parseInt(document.getElementById("edit-followers_main").value) || 0),
            total_estimated: parseInt(document.getElementById("edit-followers_main").value) || 0,
        },
        engagement_quality: document.getElementById("edit-engagement_quality").value.trim() || "Medium",
        posting_frequency: document.getElementById("edit-posting_frequency").value.trim() || "3-5x/week",
        website: {
            exists: document.getElementById("edit-website_exists").value === "yes",
            url: document.getElementById("edit-website_url").value.trim() || null,
            quality_score: null,
            quality_analysis: null,
        },
        website_need_signals: document.getElementById("edit-website_need_signals").value.split("|").map(s => s.trim()).filter(Boolean),
        suggested_website_type: document.getElementById("edit-suggested_website_type").value.trim() || "",
        business_maturity: document.getElementById("edit-business_maturity").value.trim() || "Growing",
        contact: {
            email: document.getElementById("edit-email").value.trim() || null,
            phone: document.getElementById("edit-phone").value.trim() || null,
            whatsapp: document.getElementById("edit-whatsapp").value.trim() || null,
            best_method: document.getElementById("edit-best_method").value.trim() || "Instagram DM",
        },
        founder_owner: document.getElementById("edit-founder_owner").value.trim() || null,
        lead_quality_score: parseInt(document.getElementById("edit-lead_quality_score").value) || 5,
        conversion_potential: document.getElementById("edit-conversion_potential").value.trim() || "Medium",
        payment_capacity: document.getElementById("edit-payment_capacity").value.trim() || "Medium",
        observations: document.getElementById("edit-observations").value.trim() || "",
    };

    const formData = new FormData();
    formData.append("action", "add_business");
    formData.append("data", JSON.stringify(newBusiness));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE, true);
    xhr.onload = function () {
        if (xhr.status === 200 && xhr.responseText.trim() === "OK") {
            bizMap[newId] = newBusiness;
            DB.businesses.push(newBusiness);
            filteredBizList = [...DB.businesses];
            buildFilters(DB.businesses);
            buildCharts(DB.businesses);
            renderGrid();
            resetEditForm();
            showToast("New business added successfully.", "success");
        } else {
            showToast("Add failed: " + (xhr.responseText || "Server error"), "error");
        }
    };
    xhr.onerror = function () {
        showToast("Network error. Please try again.", "error");
    };
    xhr.send(formData);
}

function loadSampleData() {
    const sample = {
        metadata: {
            generated_at: "2025-05-09T10:00:00Z",
            total_businesses: 5,
            nepal_count: 4,
            international_count: 1,
            research_depth_notes: "Sample dataset for dashboard preview.",
        },
        businesses: [
            {
                id: "BIZ_001",
                business_name: "Himalayan Brew Co.",
                country: "Nepal",
                city_region: "Kathmandu",
                industry_niche: "Food & Beverage",
                description: "A specialty coffee brand operating entirely through Instagram. They post daily latte art and brewing tutorials with 14K engaged followers.",
                main_platform: "Instagram",
                other_platforms: ["Facebook"],
                social_links: { instagram: "https://instagram.com", facebook: "https://facebook.com", tiktok: null, youtube: null, twitter: null, linkedin: null, linktree: null, other: null },
                followers: { main_platform_count: 14200, main_platform_label: "14.2K", total_estimated: 17000 },
                engagement_quality: "High",
                posting_frequency: "Daily",
                website: { exists: false, url: null, quality_score: null, quality_analysis: "No website found. WhatsApp link in Instagram bio used for orders." },
                website_need_signals: ["Uses WhatsApp for all orders", "No menu/catalog online", "No SEO presence", "Comments constantly asking for price list"],
                suggested_website_type: "Restaurant Menu Site",
                business_maturity: "Growing",
                contact: { email: null, phone: null, whatsapp: "+977-98XXXXXXXX", best_method: "Instagram DM" },
                founder_owner: "Aarav Shrestha",
                lead_quality_score: 9,
                conversion_potential: "High",
                payment_capacity: "Medium",
                observations: "Strong brand identity and very active community. Would greatly benefit from a menu site with online ordering. Owner is responsive to DMs.",
            },
            {
                id: "BIZ_002",
                business_name: "Kushal Thapas Photography",
                country: "Nepal",
                city_region: "Pokhara",
                industry_niche: "Photography & Videography",
                description: "Wedding and travel photographer with stunning portfolio shared only on Instagram. Does destination shoots across Nepal and India.",
                main_platform: "Instagram",
                other_platforms: ["YouTube"],
                social_links: { instagram: "https://instagram.com", facebook: null, tiktok: null, youtube: "https://youtube.com", twitter: null, linkedin: null, linktree: "https://linktr.ee", other: null },
                followers: { main_platform_count: 8500, main_platform_label: "8.5K", total_estimated: 11000 },
                engagement_quality: "High",
                posting_frequency: "3-5x/week",
                website: { exists: false, url: null, quality_score: null, quality_analysis: "No portfolio website. Uses Linktree with 3 links: WhatsApp, Instagram, email." },
                website_need_signals: ["No portfolio website", "No booking system", "No SEO for 'wedding photographer Nepal'", "Difficult for clients to browse packages"],
                suggested_website_type: "Portfolio",
                business_maturity: "Established",
                contact: { email: "kushal@gmail.com", phone: null, whatsapp: null, best_method: "Email" },
                founder_owner: "Kushal Thapa",
                lead_quality_score: 8,
                conversion_potential: "High",
                payment_capacity: "High",
                observations: "Established photographer with consistent style. A portfolio site with booking system would dramatically increase leads from Google searches. High-paying niche.",
            },
            {
                id: "BIZ_003",
                business_name: "Sitara Handmade",
                country: "Nepal",
                city_region: "Lalitpur",
                industry_niche: "Handmade & Crafts",
                description: "Hand-stitched bags and accessories made by local artisans. Sells through Facebook Live events and Instagram stories with growing interest from export market.",
                main_platform: "Facebook",
                other_platforms: ["Instagram", "TikTok"],
                social_links: { instagram: "https://instagram.com", facebook: "https://facebook.com", tiktok: "https://tiktok.com", youtube: null, twitter: null, linkedin: null, linktree: null, other: null },
                followers: { main_platform_count: 22000, main_platform_label: "22K", total_estimated: 30000 },
                engagement_quality: "High",
                posting_frequency: "Daily",
                website: { exists: false, url: null, quality_score: null, quality_analysis: "No website. Orders taken via Facebook comments and Messenger." },
                website_need_signals: ["No e-commerce system", "International buyers struggling to order", "No Stripe/PayPal integration", "No product catalog"],
                suggested_website_type: "E-commerce",
                business_maturity: "Growing",
                contact: { email: "sitarahandmade@gmail.com", phone: null, whatsapp: "+977-98XXXXXXXX", best_method: "Facebook Message" },
                founder_owner: "Sita Maharjan",
                lead_quality_score: 9,
                conversion_potential: "High",
                payment_capacity: "Medium",
                observations: "Has real export potential. An e-commerce site with PayPal/Stripe could unlock international sales. Very high growth signal.",
            },
            {
                id: "BIZ_004",
                business_name: "Fit With Raj",
                country: "Nepal",
                city_region: "Biratnagar",
                industry_niche: "Health & Fitness",
                description: "Online fitness coaching brand run by a certified trainer. Sells workout plans and nutrition guides through Instagram DMs and Google Forms.",
                main_platform: "Instagram",
                other_platforms: ["YouTube", "Facebook"],
                social_links: { instagram: "https://instagram.com", facebook: "https://facebook.com", tiktok: null, youtube: "https://youtube.com", twitter: null, linkedin: null, linktree: "https://linktr.ee", other: null },
                followers: { main_platform_count: 6200, main_platform_label: "6.2K", total_estimated: 9000 },
                engagement_quality: "Medium",
                posting_frequency: "3-5x/week",
                website: { exists: false, url: null, quality_score: null, quality_analysis: "Uses Linktree linking to Google Form for program sign-up. Very unprofessional." },
                website_need_signals: ["Google Form for program purchase", "No payment gateway", "No client portal", "Poor trust signals"],
                suggested_website_type: "Landing Page",
                business_maturity: "Early-stage",
                contact: { email: null, phone: null, whatsapp: null, best_method: "Instagram DM" },
                founder_owner: "Raj Yadav",
                lead_quality_score: 7,
                conversion_potential: "Medium",
                payment_capacity: "Low",
                observations: "Growing fitness brand but monetization is poor. A landing page with Stripe integration could triple his revenue. Approachable as a student project.",
            },
            {
                id: "BIZ_005",
                business_name: "Dilli Haat Boutique",
                country: "India",
                city_region: "Delhi",
                industry_niche: "Clothing & Fashion",
                description: "Ethnic wear boutique selling sarees, lehengas and kurta sets. Operates through Instagram DMs and WhatsApp catalog. Has 31K followers.",
                main_platform: "Instagram",
                other_platforms: ["WhatsApp"],
                social_links: { instagram: "https://instagram.com", facebook: null, tiktok: null, youtube: null, twitter: null, linkedin: null, linktree: null, other: null },
                followers: { main_platform_count: 31000, main_platform_label: "31K", total_estimated: 31000 },
                engagement_quality: "Medium",
                posting_frequency: "Daily",
                website: { exists: false, url: null, quality_score: null, quality_analysis: "No website. Product catalog shared via WhatsApp PDF. Highly inefficient." },
                website_need_signals: ["WhatsApp PDF catalog", "No size guide", "No ordering system", "No returns policy page", "No SEO"],
                suggested_website_type: "E-commerce",
                business_maturity: "Established",
                contact: { email: "dillihaat@gmail.com", phone: "+91-98XXXXXXXX", whatsapp: "+91-98XXXXXXXX", best_method: "WhatsApp" },
                founder_owner: "Priya Sharma",
                lead_quality_score: 8,
                conversion_potential: "High",
                payment_capacity: "High",
                observations: "Established boutique with proven demand. E-commerce site with Razorpay would dramatically increase sales efficiency. High payment capacity.",
            },
        ],
        analysis: {
            top_15_highest_potential: ["BIZ_001", "BIZ_003", "BIZ_002", "BIZ_005", "BIZ_004"],
            top_10_easiest_approach: ["BIZ_004", "BIZ_001", "BIZ_003", "BIZ_002", "BIZ_005"],
            top_10_likely_to_pay: ["BIZ_002", "BIZ_005", "BIZ_001", "BIZ_003", "BIZ_004"],
            top_10_ecommerce: ["BIZ_003", "BIZ_005", "BIZ_001", "BIZ_004", "BIZ_002"],
            top_10_seo_adsense: ["BIZ_002", "BIZ_004", "BIZ_001", "BIZ_003", "BIZ_005"],
            most_underserved_digital: ["BIZ_005", "BIZ_003", "BIZ_004"],
            fastest_growth_signals: ["BIZ_003", "BIZ_001", "BIZ_005"],
            common_patterns: [
                "Almost all businesses rely on WhatsApp or DM-based ordering with no automation",
                "Instagram is the dominant platform but most have no website or broken links",
                "Most founders are solo operators unaware of how much revenue a website could generate",
                "Comment sections are flooded with price/availability questions that a website FAQ would resolve",
            ],
            biggest_problems: [
                "Zero e-commerce infrastructure — sales happen manually through DMs",
                "No SEO — completely invisible on Google search",
                "No portfolio or catalog — customers can't browse products easily",
                "No trust signals — no reviews page, no about page, no policies",
            ],
            outreach_strategies: [
                "Comment on their most popular post: 'Have you considered a website? I noticed customers asking the same questions repeatedly'",
                "Send a DM offering a FREE audit of their online presence with 3 specific improvements",
                "Create a before/after mockup of their website as an attachment in your first message",
                "Offer a starter landing page for free in exchange for a testimonial",
            ],
            best_industries_to_target_first: ["Food & Beverage", "Photography & Videography", "Handmade & Crafts", "Clothing & Fashion", "Health & Fitness"],
            approach_strategy_for_beginners: "Start by identifying businesses with 5K-30K followers that post daily but have zero website. These businesses have proven demand and an active audience, meaning they're ripe for conversion. Reach out via Instagram DM with a specific observation about their page — not a generic pitch. Something like: 'I noticed your customers keep asking for a price list in the comments — I could build you a simple catalog page for that.' Offer a free mockup or wireframe as a proof of concept. Price your first 3 projects very low (even free) to build a portfolio, then raise rates. Focus on cafes, photographers, and handmade product sellers — they understand visual presentation and are most likely to see the value of a beautiful website.",
        },
    };
    document.getElementById("json-textarea").value = JSON.stringify(sample, null, 2);
    initDashboard(sample);
}
