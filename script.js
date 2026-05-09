const API = 'controls.php';
let DB = null;
let sortMode = 'score';
let filteredBizList = [];
const bizMap = {};
let chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function destroyAllCharts() {
    Object.keys(chartInstances).forEach(destroyChart);
    chartInstances = {};
}

document.addEventListener('DOMContentLoaded', function () {
    autoLoadData();
});

function autoLoadData() {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', API, true);
    xhr.onload = function () {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.error) {
                    showLoaderError('Server error: ' + data.error);
                    return;
                }
                initDashboard(data);
            } catch (e) {
                showLoaderError('Failed to parse data: ' + e.message);
            }
        } else {
            showLoaderError('Could not load data.json. Is the server running?');
        }
    };
    xhr.onerror = function () {
        showLoaderError('Network error. Make sure you are running this via a PHP-enabled local server (e.g. XAMPP).');
    };
    xhr.send();
}

function showLoaderError(msg) {
    document.getElementById('loader-error').textContent = 'ERROR: ' + msg;
    document.getElementById('loader-error').style.display = 'block';
}

function initDashboard(data) {
    DB = data;
    const businesses = data.businesses || [];
    Object.keys(bizMap).forEach(k => delete bizMap[k]);
    businesses.forEach(b => { bizMap[b.id] = b; });
    filteredBizList = [...businesses];

    document.getElementById('loader-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    const meta = data.metadata || {};
    const genDate = meta.generated_at
        ? new Date(meta.generated_at).toISOString().split('T')[0]
        : 'N/A';
    document.getElementById('topbar-meta').textContent =
        businesses.length + ' businesses  |  Generated ' + genDate;

    buildStats(businesses, meta);
    buildCharts(businesses);
    buildFilters(businesses);
    buildAnalysis(data.analysis || {}, businesses);
    renderGrid();
}

function buildStats(biz, meta) {
    const totalFollowers = biz.reduce((s, b) => s + (b.followers?.main_platform_count || 0), 0);
    const noWebsite = biz.filter(b => !b.website?.exists).length;
    const highLeads = biz.filter(b => (b.lead_quality_score || 0) >= 8).length;
    const avgScore = biz.length
        ? (biz.reduce((s, b) => s + (b.lead_quality_score || 0), 0) / biz.length).toFixed(1)
        : '0';

    const stats = [
        { label: 'Total Businesses', value: biz.length, sub: (meta.nepal_count || 0) + ' Nepal  |  ' + (meta.international_count || 0) + ' International', cls: 'stat-accent' },
        { label: 'No Website', value: noWebsite, sub: biz.length ? Math.round((noWebsite / biz.length) * 100) + '% of total' : '0%', cls: 'stat-yellow' },
        { label: 'High-Quality Leads', value: highLeads, sub: 'Score 8 or above', cls: 'stat-green' },
        { label: 'Avg Lead Score', value: avgScore, sub: 'Out of 10', cls: 'stat-purple' },
        { label: 'Est. Total Reach', value: formatNum(totalFollowers), sub: 'Combined followers', cls: 'stat-accent' },
        { label: 'Industries', value: new Set(biz.map(b => b.industry_niche).filter(Boolean)).size, sub: 'Unique niches', cls: '' },
    ];

    document.getElementById('stats-grid').innerHTML = stats.map(s =>
        '<div class="stat-card"><div class="stat-label">' + s.label + '</div><div class="stat-value ' + s.cls + '">' + s.value + '</div><div class="stat-sub">' + s.sub + '</div></div>'
    ).join('');
}

function buildCharts(biz) {
    destroyAllCharts();
    buildIndustryChart(biz);
    buildPlatformChart(biz);
    buildScoreChart(biz);
    buildWebsiteChart(biz);
}

function makeBarOpts(accentColor) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#5C4A32', font: { size: 10 } } },
            y: { grid: { color: 'rgba(45,36,24,0.06)' }, ticks: { color: '#5C4A32', font: { size: 10 }, precision: 0 } },
        },
    };
}

function buildIndustryChart(biz) {
    const counts = {};
    biz.forEach(b => { counts[b.industry_niche || 'Other'] = (counts[b.industry_niche || 'Other'] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx = document.getElementById('chart-industry').getContext('2d');
    chartInstances['industry'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(([k]) => k.split(' ').slice(0, 2).join(' ')),
            datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#C45C2C33', borderColor: '#C45C2C', borderWidth: 1.5 }],
        },
        options: Object.assign({ indexAxis: 'y' }, makeBarOpts()),
    });
}

function buildPlatformChart(biz) {
    const counts = {};
    biz.forEach(b => { counts[b.main_platform || 'Other'] = (counts[b.main_platform || 'Other'] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = ['#C45C2C', '#7B5EA7', '#3A7A7A', '#C4942C', '#B83A2B', '#4A7C3F', '#ec4899', '#f97316'];
    const ctx = document.getElementById('chart-platform').getContext('2d');
    chartInstances['platform'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(([k]) => k),
            datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: colors.slice(0, sorted.length), borderColor: '#EDE5D0', borderWidth: 2 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: { legend: { display: true, position: 'bottom', labels: { color: '#5C4A32', font: { size: 10 }, padding: 10, boxWidth: 10, boxHeight: 10 } } },
        },
    });
}

function buildScoreChart(biz) {
    const dist = Array(10).fill(0);
    biz.forEach(b => {
        const s = Math.min(10, Math.max(1, Math.round(b.lead_quality_score || 0)));
        dist[s - 1]++;
    });
    const ctx = document.getElementById('chart-scores').getContext('2d');
    chartInstances['scores'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            datasets: [{
                data: dist,
                backgroundColor: dist.map((_, i) => i >= 7 ? '#4A7C3F33' : i >= 4 ? '#C4942C33' : '#B83A2B33'),
                borderColor: dist.map((_, i) => i >= 7 ? '#4A7C3F' : i >= 4 ? '#C4942C' : '#B83A2B'),
                borderWidth: 1.5,
            }],
        },
        options: makeBarOpts(),
    });
}

function buildWebsiteChart(biz) {
    const hasWeb = biz.filter(b => b.website?.exists).length;
    const noWeb = biz.length - hasWeb;
    const highConv = biz.filter(b => b.conversion_potential === 'High').length;
    const medConv = biz.filter(b => b.conversion_potential === 'Medium').length;
    const lowConv = biz.filter(b => b.conversion_potential === 'Low').length;
    const ctx = document.getElementById('chart-website').getContext('2d');
    chartInstances['website'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['No Website', 'Has Website', 'High Conv.', 'Med Conv.', 'Low Conv.'],
            datasets: [{
                data: [noWeb, hasWeb, highConv, medConv, lowConv],
                backgroundColor: ['#B83A2B33', '#4A7C3F33', '#C45C2C33', '#C4942C33', '#6B728033'],
                borderColor: ['#B83A2B', '#4A7C3F', '#C45C2C', '#C4942C', '#6B7280'],
                borderWidth: 1.5,
            }],
        },
        options: makeBarOpts(),
    });
}

function buildFilters(biz) {
    const countries = [...new Set(biz.map(b => b.country).filter(Boolean))].sort();
    const industries = [...new Set(biz.map(b => b.industry_niche).filter(Boolean))].sort();
    const platforms = [...new Set(biz.map(b => b.main_platform).filter(Boolean))].sort();
    populateSelect('filter-country', countries);
    populateSelect('filter-industry', industries);
    populateSelect('filter-platform', platforms);
}

function populateSelect(id, options) {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="">All</option>';
    options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        el.appendChild(opt);
    });
}

function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const country = document.getElementById('filter-country').value;
    const industry = document.getElementById('filter-industry').value;
    const platform = document.getElementById('filter-platform').value;
    const website = document.getElementById('filter-website').value;
    const minScore = parseInt(document.getElementById('filter-score').value) || 0;
    const biz = DB ? DB.businesses : [];

    filteredBizList = biz.filter(b => {
        if (search && !(b.business_name + (b.description || '') + (b.city_region || '') + (b.founder_owner || '')).toLowerCase().includes(search)) return false;
        if (country && b.country !== country) return false;
        if (industry && b.industry_niche !== industry) return false;
        if (platform && b.main_platform !== platform) return false;
        if (website === 'no' && b.website?.exists) return false;
        if (website === 'yes' && !b.website?.exists) return false;
        if ((b.lead_quality_score || 0) < minScore) return false;
        return true;
    });
    renderGrid();
}

function setSortMode(mode) {
    sortMode = mode;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sort-' + mode).classList.add('active');
    renderGrid();
}

function renderGrid() {
    const sorted = [...filteredBizList].sort((a, b) => {
        if (sortMode === 'score') return (b.lead_quality_score || 0) - (a.lead_quality_score || 0);
        if (sortMode === 'name') return (a.business_name || '').localeCompare(b.business_name || '');
        if (sortMode === 'followers') return (b.followers?.main_platform_count || 0) - (a.followers?.main_platform_count || 0);
        return 0;
    });

    const grid = document.getElementById('biz-grid');
    document.getElementById('filter-count').textContent = sorted.length + ' results';

    if (!sorted.length) {
        grid.innerHTML = '<div class="no-results">No businesses match your filters.</div>';
        return;
    }
    grid.innerHTML = sorted.map(b => bizCard(b)).join('');
}

function bizCard(b) {
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? 'score-high' : score >= 5 ? 'score-med' : 'score-low';
    const engCls = b.engagement_quality === 'High' ? 'eng-high' : b.engagement_quality === 'Medium' ? 'eng-med' : 'eng-low';
    const webTag = b.website?.exists
        ? '<span class="tag tag-has-site">Has Website</span>'
        : '<span class="tag tag-no-site">No Website</span>';
    const signals = (b.website_need_signals || []).slice(0, 3);
    const followersText = b.followers?.main_platform_label || (b.followers?.main_platform_count ? formatNum(b.followers.main_platform_count) : '—');

    return '<div class="biz-card" onclick="openModal(\'' + b.id + '\')">' +
        '<div class="biz-card-header">' +
            '<div class="biz-card-body">' +
                '<div class="biz-name">' + esc(b.business_name) + '</div>' +
                '<div class="biz-location">' + esc(b.city_region || '') + ', ' + esc(b.country || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div class="score-badge ' + scoreCls + '">' + score + '</div>' +
                '<div class="biz-actions">' +
                    '<button onclick="event.stopPropagation();openEditForm(\'' + b.id + '\')" title="Edit this business">E</button>' +
                    '<button class="delete" onclick="event.stopPropagation();confirmDelete(\'' + b.id + '\')" title="Delete this business">X</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="biz-tags">' +
            (b.industry_niche ? '<span class="tag tag-industry">' + esc(b.industry_niche) + '</span>' : '') +
            (b.main_platform ? '<span class="tag tag-platform">' + esc(b.main_platform) + '</span>' : '') +
            (b.business_maturity ? '<span class="tag tag-maturity">' + esc(b.business_maturity) + '</span>' : '') +
            webTag +
        '</div>' +
        '<div class="biz-desc">' + esc(b.description || '') + '</div>' +
        '<div class="biz-meta-row">' +
            '<span class="biz-followers">Followers: ' + followersText + '</span>' +
            '<span class="biz-engagement"><span class="eng-dot ' + engCls + '"></span>' + (b.engagement_quality || '—') + ' engagement</span>' +
        '</div>' +
        (signals.length ? '<div class="biz-signals"><div class="signals-label">Why they need a website</div>' +
            signals.map(s => '<span class="signal-pill">' + esc(s) + '</span>').join('') + '</div>' : '') +
    '</div>';
}

function openModal(id) {
    const b = bizMap[id];
    if (!b) return;
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? 'score-high' : score >= 5 ? 'score-med' : 'score-low';
    const payCapColor = b.payment_capacity === 'High' ? '#4A7C3F' : b.payment_capacity === 'Medium' ? '#C4942C' : '#B83A2B';
    const convColor = b.conversion_potential === 'High' ? '#4A7C3F' : b.conversion_potential === 'Medium' ? '#C4942C' : '#B83A2B';

    const contactRows = [];
    if (b.contact?.email) contactRows.push({ icon: '&#128231;', type: 'Email', val: '<a href="mailto:' + esc(b.contact.email) + '">' + esc(b.contact.email) + '</a>' });
    if (b.contact?.whatsapp) contactRows.push({ icon: '&#128172;', type: 'WhatsApp', val: esc(b.contact.whatsapp) });
    if (b.contact?.phone) contactRows.push({ icon: '&#128222;', type: 'Phone', val: esc(b.contact.phone) });
    if (!contactRows.length) contactRows.push({ icon: '&#128236;', type: 'Best method', val: esc(b.contact?.best_method || 'Instagram DM') });

    const platformLinks = Object.entries(b.social_links || {})
        .filter(([, v]) => v)
        .map(([k, v]) => '<div class="platform-chip"><a href="' + esc(v) + '" target="_blank">' + k.charAt(0).toUpperCase() + k.slice(1) + ' &#8599;</a></div>')
        .join('');

    document.getElementById('modal-title').textContent = b.business_name || 'Unknown Business';
    document.getElementById('modal-subtitle').textContent = (b.id || '') + '  |  ' + (b.industry_niche || '') + '  |  ' + (b.city_region || '') + ', ' + (b.country || '');

    document.getElementById('modal-body').innerHTML =
        '<div><div class="modal-section-title">Scores & Potential</div><div class="score-row">' +
            '<div class="score-item"><div class="score-ring ' + scoreCls + '">' + score + '</div><div class="score-ring-label">Lead Score</div></div>' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:8px;">' +
                '<div class="modal-field"><div class="modal-field-label">Conversion potential</div><div class="modal-field-value" style="color:' + convColor + '">' + (b.conversion_potential || '—') + '</div></div>' +
                '<div class="modal-field"><div class="modal-field-label">Payment capacity</div><div class="modal-field-value" style="color:' + payCapColor + '">' + (b.payment_capacity || '—') + '</div></div>' +
            '</div>' +
        '</div></div>' +

        '<div><div class="modal-section-title">Business Details</div><div class="modal-grid">' +
            '<div class="modal-field"><div class="modal-field-label">Industry</div><div class="modal-field-value">' + esc(b.industry_niche || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Business maturity</div><div class="modal-field-value">' + esc(b.business_maturity || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Posting frequency</div><div class="modal-field-value">' + esc(b.posting_frequency || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Engagement quality</div><div class="modal-field-value">' + esc(b.engagement_quality || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Main platform</div><div class="modal-field-value">' + esc(b.main_platform || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Followers</div><div class="modal-field-value">' + (b.followers?.main_platform_label || formatNum(b.followers?.main_platform_count) || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Suggested website</div><div class="modal-field-value">' + esc(b.suggested_website_type || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Founder/Owner</div><div class="modal-field-value ' + (b.founder_owner ? '' : 'null-val') + '">' + esc(b.founder_owner || 'Unknown') + '</div></div>' +
        '</div></div>' +

        (b.description ? '<div><div class="modal-section-title">Description</div><div class="obs-box" style="border-color:var(--purple)">' + esc(b.description) + '</div></div>' : '') +

        '<div><div class="modal-section-title">Website Analysis</div><div class="modal-grid">' +
            '<div class="modal-field"><div class="modal-field-label">Website exists</div><div class="modal-field-value" style="color:' + (b.website?.exists ? 'var(--green)' : 'var(--red)') + '">' + (b.website?.exists ? 'Yes' : 'No') + '</div></div>' +
            (b.website?.url ? '<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value"><a href="' + esc(b.website.url) + '" target="_blank">' + esc(b.website.url) + '</a></div></div>' : '<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value null-val">None found</div></div>') +
            (b.website?.quality_score != null ? '<div class="modal-field"><div class="modal-field-label">Quality score</div><div class="modal-field-value">' + b.website.quality_score + '/10</div></div>' : '') +
        '</div>' + (b.website?.quality_analysis ? '<div class="obs-box" style="margin-top:8px;border-color:var(--red);font-size:12px">' + esc(b.website.quality_analysis) + '</div>' : '') + '</div>' +

        ((b.website_need_signals || []).length ? '<div><div class="modal-section-title">Why they need a website</div><div class="signals-list">' +
            (b.website_need_signals || []).map(s => '<div class="signal-item">&#9888; ' + esc(s) + '</div>').join('') + '</div></div>' : '') +

        '<div><div class="modal-section-title">Contact Information</div>' +
            contactRows.map(r => '<div class="contact-row"><div class="contact-icon">' + r.icon + '</div><div class="contact-info"><div class="contact-type">' + r.type + '</div><div class="contact-val">' + r.val + '</div></div></div>').join('') +
            '<div style="margin-top:6px;font-size:11px;color:var(--text3)">Best contact: <strong style="color:var(--text2)">' + esc(b.contact?.best_method || '—') + '</strong></div>' +
        '</div>' +

        (platformLinks ? '<div><div class="modal-section-title">All Social Platforms</div><div class="platforms-list">' + platformLinks + '</div></div>' : '') +

        (b.observations ? '<div><div class="modal-section-title">Analyst Observations</div><div class="obs-box">' + esc(b.observations) + '</div></div>' : '');

    document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
});

function buildAnalysis(analysis, biz) {
    const grid = document.getElementById('analysis-grid');
    const cards = [];

    function topListCard(title, icon, ids, colorClass) {
        if (!ids || !ids.length) return '';
        const items = ids.map((id, i) => {
            const b = bizMap[id];
            if (!b) return '';
            return '<div class="top-biz-item" onclick="openModal(\'' + id + '\')">' +
                '<span class="top-biz-rank">#' + (i + 1) + '</span>' +
                '<span class="top-biz-name">' + esc(b.business_name) + '</span>' +
                '<span class="top-biz-score" style="color:' + colorClass + '">' + (b.lead_quality_score || '—') + '</span>' +
            '</div>';
        }).join('');
        return '<div class="analysis-card"><div class="analysis-card-title"><span class="icon">' + icon + '</span>' + title + '</div><div class="top-biz-list">' + items + '</div></div>';
    }

    cards.push(topListCard('Top 15 Highest Potential', '&#127942;', analysis.top_15_highest_potential, 'var(--green)'));
    cards.push(topListCard('Easiest to Approach', '&#128075;', analysis.top_10_easiest_approach, 'var(--teal)'));
    cards.push(topListCard('Most Likely to Pay', '&#128176;', analysis.top_10_likely_to_pay, 'var(--yellow)'));
    cards.push(topListCard('Best for E-Commerce', '&#128722;', analysis.top_10_ecommerce, 'var(--purple)'));
    cards.push(topListCard('Best for SEO + AdSense', '&#128200;', analysis.top_10_seo_adsense, 'var(--accent)'));
    cards.push(topListCard('Most Underserved Digitally', '&#127760;', analysis.most_underserved_digital, 'var(--pink)'));
    cards.push(topListCard('Fastest Growth Signals', '&#128640;', analysis.fastest_growth_signals, 'var(--orange)'));

    if ((analysis.common_patterns || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><span class="icon">&#128269;</span>Common Patterns Discovered</div><div class="pattern-list">' +
            analysis.common_patterns.map(p => '<div class="pattern-item">' + esc(p) + '</div>').join('') + '</div></div>');
    }

    if ((analysis.biggest_problems || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><span class="icon">&#9888;</span>Biggest Website Problems</div><div class="strategy-list">' +
            analysis.biggest_problems.map(p => '<div class="problem-item">' + esc(p) + '</div>').join('') + '</div></div>');
    }

    if ((analysis.outreach_strategies || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><span class="icon">&#128227;</span>Best Outreach Strategies</div><div class="strategy-list">' +
            analysis.outreach_strategies.map(p => '<div class="strategy-item">' + esc(p) + '</div>').join('') + '</div></div>');
    }

    if ((analysis.best_industries_to_target_first || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><span class="icon">&#127919;</span>Best Industries to Target First</div><div>' +
            analysis.best_industries_to_target_first.map(i => '<span class="industry-pill">' + esc(i) + '</span>').join('') + '</div></div>');
    }

    if (analysis.approach_strategy_for_beginners) {
        cards.push('<div class="analysis-card" style="grid-column:1/-1"><div class="analysis-card-title"><span class="icon">&#128161;</span>Approach Strategy for Beginners</div><div class="approach-box">' + esc(analysis.approach_strategy_for_beginners) + '</div></div>');
    }

    grid.innerHTML = cards.filter(Boolean).join('');
}

function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast ' + (type || '');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

/* ---- RAW JSON EDITOR ---- */
function toggleRawEditor() {
    const wrap = document.getElementById('raw-editor-wrap');
    const isActive = wrap.classList.toggle('active');
    if (isActive) {
        document.getElementById('raw-json-error').style.display = 'none';
        document.getElementById('raw-json-editor').value = JSON.stringify(DB, null, 2);
        document.getElementById('raw-editor-wrap').scrollIntoView({ behavior: 'smooth' });
    }
}

function saveRawJson() {
    const raw = document.getElementById('raw-json-editor').value.trim();
    const errorEl = document.getElementById('raw-json-error');
    errorEl.style.display = 'none';

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        errorEl.textContent = 'Invalid JSON: ' + e.message;
        errorEl.style.display = 'block';
        return;
    }

    if (!parsed.businesses || !Array.isArray(parsed.businesses)) {
        errorEl.textContent = 'JSON must contain a "businesses" array.';
        errorEl.style.display = 'block';
        return;
    }

    apiCall({ action: 'save_raw_json', json: raw }, function (data) {
        if (data && data.status === 'ok') {
            DB = parsed;
            Object.keys(bizMap).forEach(k => delete bizMap[k]);
            parsed.businesses.forEach(b => { bizMap[b.id] = b; });
            filteredBizList = [...parsed.businesses];
            document.getElementById('filter-country').innerHTML = '<option value="">All</option>';
            document.getElementById('filter-industry').innerHTML = '<option value="">All</option>';
            document.getElementById('filter-platform').innerHTML = '<option value="">All</option>';
            buildFilters(parsed.businesses);
            buildCharts(parsed.businesses);
            buildAnalysis(parsed.analysis || {}, parsed.businesses);
            renderGrid();
            showToast('JSON saved successfully.', 'success');
            document.getElementById('raw-editor-wrap').classList.remove('active');
        } else {
            errorEl.textContent = 'Save failed: ' + (data ? data.error : 'Server error');
            errorEl.style.display = 'block';
        }
    });
}

function cancelRawEdit() {
    document.getElementById('raw-editor-wrap').classList.remove('active');
    document.getElementById('raw-json-error').style.display = 'none';
}

/* ---- ADD NEW / EDIT FORM ---- */
let editingId = null;

function showAddForm() {
    editingId = null;
    const section = document.getElementById('form-section');
    section.classList.add('active');
    document.getElementById('form-section-title').textContent = 'Add New Business';
    document.getElementById('delete-from-form-btn').style.display = 'none';
    clearFormFields();
    document.getElementById('edit-id').readOnly = true;
    document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
}

function openEditForm(id) {
    const b = bizMap[id];
    if (!b) return;
    editingId = id;
    const section = document.getElementById('form-section');
    section.classList.add('active');
    document.getElementById('form-section-title').textContent = 'Edit Business: ' + b.business_name;
    clearFormFields();
    document.getElementById('edit-id').readOnly = true;
    document.getElementById('delete-from-form-btn').style.display = 'inline-block';
    document.getElementById('edit-id').value = b.id || '';
    document.getElementById('edit-business_name').value = b.business_name || '';
    document.getElementById('edit-country').value = b.country || '';
    document.getElementById('edit-city_region').value = b.city_region || '';
    document.getElementById('edit-industry_niche').value = b.industry_niche || '';
    document.getElementById('edit-description').value = b.description || '';
    document.getElementById('edit-main_platform').value = b.main_platform || '';
    document.getElementById('edit-other_platforms').value = (b.other_platforms || []).join(', ');
    document.getElementById('edit-instagram').value = b.social_links?.instagram || '';
    document.getElementById('edit-facebook').value = b.social_links?.facebook || '';
    document.getElementById('edit-tiktok').value = b.social_links?.tiktok || '';
    document.getElementById('edit-youtube').value = b.social_links?.youtube || '';
    document.getElementById('edit-linkedin').value = b.social_links?.linkedin || '';
    document.getElementById('edit-followers_main').value = b.followers?.main_platform_count || '';
    document.getElementById('edit-engagement_quality').value = b.engagement_quality || '';
    document.getElementById('edit-posting_frequency').value = b.posting_frequency || '';
    document.getElementById('edit-website_exists').value = b.website?.exists ? 'yes' : 'no';
    document.getElementById('edit-website_url').value = b.website?.url || '';
    document.getElementById('edit-website_need_signals').value = (b.website_need_signals || []).join(' | ');
    document.getElementById('edit-suggested_website_type').value = b.suggested_website_type || '';
    document.getElementById('edit-business_maturity').value = b.business_maturity || '';
    document.getElementById('edit-email').value = b.contact?.email || '';
    document.getElementById('edit-phone').value = b.contact?.phone || '';
    document.getElementById('edit-whatsapp').value = b.contact?.whatsapp || '';
    document.getElementById('edit-best_method').value = b.contact?.best_method || '';
    document.getElementById('edit-founder_owner').value = b.founder_owner || '';
    document.getElementById('edit-lead_quality_score').value = b.lead_quality_score || '';
    document.getElementById('edit-conversion_potential').value = b.conversion_potential || '';
    document.getElementById('edit-payment_capacity').value = b.payment_capacity || '';
    document.getElementById('edit-observations').value = b.observations || '';
    document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
}

function clearFormFields() {
    [
        'edit-id', 'edit-business_name', 'edit-country', 'edit-city_region',
        'edit-industry_niche', 'edit-description', 'edit-main_platform',
        'edit-other_platforms', 'edit-instagram', 'edit-facebook', 'edit-tiktok',
        'edit-youtube', 'edit-linkedin', 'edit-followers_main',
        'edit-engagement_quality', 'edit-posting_frequency', 'edit-website_exists',
        'edit-website_url', 'edit-website_need_signals', 'edit-suggested_website_type',
        'edit-business_maturity', 'edit-email', 'edit-phone', 'edit-whatsapp',
        'edit-best_method', 'edit-founder_owner', 'edit-lead_quality_score',
        'edit-conversion_potential', 'edit-payment_capacity', 'edit-observations',
    ].forEach(id => { document.getElementById(id).value = ''; });
}

function closeForm() {
    document.getElementById('form-section').classList.remove('active');
    editingId = null;
}

function gatherFormData() {
    const followersRaw = parseInt(document.getElementById('edit-followers_main').value) || 0;
    return {
        id: editingId,
        business_name: document.getElementById('edit-business_name').value.trim(),
        country: document.getElementById('edit-country').value.trim() || 'Nepal',
        city_region: document.getElementById('edit-city_region').value.trim() || '',
        industry_niche: document.getElementById('edit-industry_niche').value.trim() || '',
        description: document.getElementById('edit-description').value.trim() || '',
        main_platform: document.getElementById('edit-main_platform').value.trim() || 'Instagram',
        other_platforms: document.getElementById('edit-other_platforms').value.split(',').map(s => s.trim()).filter(Boolean),
        social_links: {
            instagram: document.getElementById('edit-instagram').value.trim() || null,
            facebook: document.getElementById('edit-facebook').value.trim() || null,
            tiktok: document.getElementById('edit-tiktok').value.trim() || null,
            youtube: document.getElementById('edit-youtube').value.trim() || null,
            twitter: null,
            linkedin: document.getElementById('edit-linkedin').value.trim() || null,
            linktree: null,
            other: null,
        },
        followers: {
            main_platform_count: followersRaw,
            main_platform_label: formatNum(followersRaw),
            total_estimated: followersRaw,
        },
        engagement_quality: document.getElementById('edit-engagement_quality').value.trim() || 'Medium',
        posting_frequency: document.getElementById('edit-posting_frequency').value.trim() || '3-5x/week',
        website: {
            exists: document.getElementById('edit-website_exists').value === 'yes',
            url: document.getElementById('edit-website_url').value.trim() || null,
            quality_score: null,
            quality_analysis: null,
        },
        website_need_signals: document.getElementById('edit-website_need_signals').value.split('|').map(s => s.trim()).filter(Boolean),
        suggested_website_type: document.getElementById('edit-suggested_website_type').value.trim() || '',
        business_maturity: document.getElementById('edit-business_maturity').value.trim() || 'Growing',
        contact: {
            email: document.getElementById('edit-email').value.trim() || null,
            phone: document.getElementById('edit-phone').value.trim() || null,
            whatsapp: document.getElementById('edit-whatsapp').value.trim() || null,
            best_method: document.getElementById('edit-best_method').value.trim() || 'Instagram DM',
        },
        founder_owner: document.getElementById('edit-founder_owner').value.trim() || null,
        lead_quality_score: parseInt(document.getElementById('edit-lead_quality_score').value) || 5,
        conversion_potential: document.getElementById('edit-conversion_potential').value.trim() || 'Medium',
        payment_capacity: document.getElementById('edit-payment_capacity').value.trim() || 'Medium',
        observations: document.getElementById('edit-observations').value.trim() || '',
    };
}

function saveBusiness() {
    const business_name = document.getElementById('edit-business_name').value.trim();
    if (!business_name) {
        showToast('Business name is required.', 'error');
        return;
    }

    const formData = gatherFormData();
    formData.id = editingId;

    if (editingId) {
        apiCall({ action: 'update_business', business_id: editingId, data: formData }, function (data) {
            if (data && data.status === 'ok') {
                bizMap[editingId] = formData;
                const idx = DB.businesses.findIndex(b => b.id === editingId);
                if (idx !== -1) DB.businesses[idx] = formData;
                buildCharts(DB.businesses);
                renderGrid();
                closeForm();
                showToast('Business updated.', 'success');
            } else {
                showToast('Update failed: ' + (data ? data.error : 'Server error'), 'error');
            }
        });
    } else {
        const formDataNew = Object.assign({}, formData);
        delete formDataNew.id;
        apiCall({ action: 'add_business', data: formDataNew }, function (data) {
            if (data && data.status === 'ok') {
                const newId = data.new_id || formDataNew.id;
                formDataNew.id = newId;
                bizMap[newId] = formDataNew;
                DB.businesses.push(formDataNew);
                filteredBizList = [...DB.businesses];
                buildFilters(DB.businesses);
                buildCharts(DB.businesses);
                renderGrid();
                closeForm();
                showToast('Business added.', 'success');
            } else {
                showToast('Add failed: ' + (data ? data.error : 'Server error'), 'error');
            }
        });
    }
}

function confirmDelete(id) {
    if (!confirm('Delete "' + (bizMap[id]?.business_name || id) + '"? This cannot be undone.')) return;

    apiCall({ action: 'delete_business', business_id: id }, function (data) {
        if (data && data.status === 'ok') {
            delete bizMap[id];
            DB.businesses = DB.businesses.filter(b => b.id !== id);
            filteredBizList = filteredBizList.filter(b => b.id !== id);
            buildCharts(DB.businesses);
            renderGrid();
            showToast('Business deleted.', 'success');
        } else {
            showToast('Delete failed: ' + (data ? data.error : 'Server error'), 'error');
        }
    });
}

function deleteFromForm() {
    if (!editingId) return;
    if (!confirm('Delete "' + (bizMap[editingId]?.business_name || editingId) + '"? This cannot be undone.')) return;

    apiCall({ action: 'delete_business', business_id: editingId }, function (data) {
        if (data && data.status === 'ok') {
            delete bizMap[editingId];
            DB.businesses = DB.businesses.filter(b => b.id !== editingId);
            filteredBizList = filteredBizList.filter(b => b.id !== editingId);
            buildCharts(DB.businesses);
            renderGrid();
            closeForm();
            showToast('Business deleted.', 'success');
        } else {
            showToast('Delete failed: ' + (data ? data.error : 'Server error'), 'error');
        }
    });
}

function apiCall(payload, callback) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
        let data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        callback(data);
    };
    xhr.onerror = function () { callback(null); };
    xhr.send(JSON.stringify(payload));
}
