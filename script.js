const API = 'controls.php';
let DB = null;
let sortMode = 'score';
let filteredBizList = [];
const bizMap = {};
let chartInstances = {};
let currentModalType = null;
let editingId = null;

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

/* ---- BOOTSTRAP ---- */
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
                if (data.error) { showLoaderError('Server error: ' + data.error); return; }
                initDashboard(data);
            } catch (e) { showLoaderError('Failed to parse data: ' + e.message); }
        } else {
            showLoaderError('Could not load data.json. Is the PHP server running?');
        }
    };
    xhr.onerror = function () {
        showLoaderError('Network error. Make sure you are running via XAMPP or a PHP-enabled local server.');
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
    const genDate = meta.generated_at ? new Date(meta.generated_at).toISOString().split('T')[0] : 'N/A';
    document.getElementById('topbar-meta').textContent = businesses.length + ' businesses  |  Generated ' + genDate;

    buildStats(businesses, meta);
    buildCharts(businesses);
    buildFilters(businesses);
    buildAnalysis(data.analysis || {}, businesses);
    renderGrid();
}

/* ---- STATS ---- */
function buildStats(biz, meta) {
    const totalFollowers = biz.reduce((s, b) => s + (b.followers?.main_platform_count || 0), 0);
    const noWebsite = biz.filter(b => !b.website?.exists).length;
    const highLeads = biz.filter(b => (b.lead_quality_score || 0) >= 8).length;
    const avgScore = biz.length ? (biz.reduce((s, b) => s + (b.lead_quality_score || 0), 0) / biz.length).toFixed(1) : '0';

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

/* ---- CHARTS ---- */
function buildCharts(biz) {
    destroyAllCharts();
    buildIndustryChart(biz);
    buildPlatformChart(biz);
    buildScoreChart(biz);
    buildWebsiteChart(biz);
}

function makeBarOpts() {
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
        data: { labels: sorted.map(([k]) => k.split(' ').slice(0, 2).join(' ')), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#C45C2C33', borderColor: '#C45C2C', borderWidth: 1.5 }] },
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
        data: { labels: sorted.map(([k]) => k), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: colors.slice(0, sorted.length), borderColor: '#EDE5D0', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: true, position: 'bottom', labels: { color: '#5C4A32', font: { size: 10 }, padding: 10, boxWidth: 10, boxHeight: 10 } } } },
    });
}

function buildScoreChart(biz) {
    const dist = Array(10).fill(0);
    biz.forEach(b => { const s = Math.min(10, Math.max(1, Math.round(b.lead_quality_score || 0))); dist[s - 1]++; });
    const ctx = document.getElementById('chart-scores').getContext('2d');
    chartInstances['scores'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], datasets: [{ data: dist, backgroundColor: dist.map((_, i) => i >= 7 ? '#4A7C3F33' : i >= 4 ? '#C4942C33' : '#B83A2B33'), borderColor: dist.map((_, i) => i >= 7 ? '#4A7C3F' : i >= 4 ? '#C4942C' : '#B83A2B'), borderWidth: 1.5 }] },
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
        data: { labels: ['No Website', 'Has Website', 'High Conv.', 'Med Conv.', 'Low Conv.'], datasets: [{ data: [noWeb, hasWeb, highConv, medConv, lowConv], backgroundColor: ['#B83A2B33', '#4A7C3F33', '#C45C2C33', '#C4942C33', '#6B728033'], borderColor: ['#B83A2B', '#4A7C3F', '#C45C2C', '#C4942C', '#6B7280'], borderWidth: 1.5 }] },
        options: makeBarOpts(),
    });
}

/* ---- FILTERS ---- */
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

/* ---- GRID ---- */
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
        grid.innerHTML = '<div class="no-results"><i class="fa-solid fa-search"></i> No businesses match your filters.</div>';
        return;
    }
    grid.innerHTML = sorted.map(b => bizCard(b)).join('');
}

function bizCard(b) {
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? 'score-high' : score >= 5 ? 'score-med' : 'score-low';
    const engCls = b.engagement_quality === 'High' ? 'eng-high' : b.engagement_quality === 'Medium' ? 'eng-med' : 'eng-low';
    const webTag = b.website?.exists ? '<span class="tag tag-has-site"><i class="fa-solid fa-globe"></i> Website</span>' : '<span class="tag tag-no-site"><i class="fa-solid fa-globe"></i> No Site</span>';
    const signals = (b.website_need_signals || []).slice(0, 3);
    const followersText = b.followers?.main_platform_label || (b.followers?.main_platform_count ? formatNum(b.followers.main_platform_count) : '—');

    return '<div class="biz-card" onclick="openViewModal(\'' + b.id + '\')">' +
        '<div class="biz-card-header">' +
            '<div class="biz-card-body">' +
                '<div class="biz-name">' + esc(b.business_name) + '</div>' +
                '<div class="biz-location"><i class="fa-solid fa-location-dot"></i> ' + esc(b.city_region || '') + ', ' + esc(b.country || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div class="score-badge ' + scoreCls + '">' + score + '</div>' +
                '<div class="biz-actions">' +
                    '<button class="action-btn edit-btn" onclick="event.stopPropagation();openEditModal(\'' + b.id + '\')" title="Edit this business"><i class="fa-solid fa-pencil"></i></button>' +
                    '<button class="action-btn delete-btn" onclick="event.stopPropagation();openDeleteModal(\'' + b.id + '\')" title="Delete this business"><i class="fa-solid fa-trash"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="biz-tags">' +
            (b.industry_niche ? '<span class="tag tag-industry"><i class="fa-solid fa-tag"></i> ' + esc(b.industry_niche) + '</span>' : '') +
            (b.main_platform ? '<span class="tag tag-platform"><i class="fa-solid fa-share-nodes"></i> ' + esc(b.main_platform) + '</span>' : '') +
            (b.business_maturity ? '<span class="tag tag-maturity"><i class="fa-solid fa-chart-line"></i> ' + esc(b.business_maturity) + '</span>' : '') +
            webTag +
        '</div>' +
        '<div class="biz-desc">' + esc(b.description || '') + '</div>' +
        '<div class="biz-meta-row">' +
            '<span class="biz-followers"><i class="fa-solid fa-users"></i> ' + followersText + '</span>' +
            '<span class="biz-engagement"><span class="eng-dot ' + engCls + '"></span>' + (b.engagement_quality || '—') + ' engagement</span>' +
            (b.suggested_website_type ? '<span class="biz-website-type"><i class="fa-solid fa-laptop-code"></i> ' + esc(b.suggested_website_type) + '</span>' : '') +
        '</div>' +
        (signals.length ? '<div class="biz-signals"><div class="signals-label"><i class="fa-solid fa-flag"></i> Why they need a website</div>' +
            signals.map(s => '<span class="signal-pill">' + esc(s) + '</span>').join('') + '</div>' : '') +
    '</div>';
}

/* ---- MODAL SYSTEM ---- */
function openModal(title, subtitle, bodyHTML, size) {
    currentModalType = title;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-subtitle').textContent = subtitle || '';
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal').className = 'modal' + (size ? ' modal-' + size : '');
    document.getElementById('modal-overlay').classList.add('open');
}

function closeAllModals() {
    document.getElementById('modal-overlay').classList.remove('open');
    currentModalType = null;
}

document.getElementById('modal-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeAllModals();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllModals();
});

/* ---- VIEW MODAL ---- */
function openViewModal(id) {
    const b = bizMap[id];
    if (!b) return;
    const score = b.lead_quality_score || 0;
    const scoreCls = score >= 8 ? 'score-high' : score >= 5 ? 'score-med' : 'score-low';
    const payCapColor = b.payment_capacity === 'High' ? '#4A7C3F' : b.payment_capacity === 'Medium' ? '#C4942C' : '#B83A2B';
    const convColor = b.conversion_potential === 'High' ? '#4A7C3F' : b.conversion_potential === 'Medium' ? '#C4942C' : '#B83A2B';

    const contactRows = [];
    if (b.contact?.email) contactRows.push({ icon: 'fa-envelope', type: 'Email', val: '<a href="mailto:' + esc(b.contact.email) + '">' + esc(b.contact.email) + '</a>' });
    if (b.contact?.whatsapp) contactRows.push({ icon: 'fa-whatsapp', type: 'WhatsApp', val: esc(b.contact.whatsapp) });
    if (b.contact?.phone) contactRows.push({ icon: 'fa-phone', type: 'Phone', val: esc(b.contact.phone) });
    if (!contactRows.length) contactRows.push({ icon: 'fa-comment-dots', type: 'Best method', val: esc(b.contact?.best_method || 'Instagram DM') });

    const platformLinks = Object.entries(b.social_links || {})
        .filter(([, v]) => v)
        .map(([k, v]) => '<div class="platform-chip"><a href="' + esc(v) + '" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + k.charAt(0).toUpperCase() + k.slice(1) + '</a></div>')
        .join('');

    openModal(
        b.business_name || 'Unknown Business',
        b.id + '  |  ' + b.industry_niche + '  |  ' + b.city_region + ', ' + b.country,
        '<div><div class="modal-section-title"><i class="fa-solid fa-chart-simple"></i> Scores &amp; Potential</div><div class="score-row">' +
            '<div class="score-item"><div class="score-ring ' + scoreCls + '">' + score + '</div><div class="score-ring-label">Lead Score</div></div>' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:8px;">' +
                '<div class="modal-field"><div class="modal-field-label">Conversion potential</div><div class="modal-field-value" style="color:' + convColor + '">' + (b.conversion_potential || '—') + '</div></div>' +
                '<div class="modal-field"><div class="modal-field-label">Payment capacity</div><div class="modal-field-value" style="color:' + payCapColor + '">' + (b.payment_capacity || '—') + '</div></div>' +
            '</div>' +
        '</div></div>' +

        '<div><div class="modal-section-title"><i class="fa-solid fa-building"></i> Business Details</div><div class="modal-grid">' +
            '<div class="modal-field"><div class="modal-field-label">Industry</div><div class="modal-field-value">' + esc(b.industry_niche || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Business maturity</div><div class="modal-field-value">' + esc(b.business_maturity || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Posting frequency</div><div class="modal-field-value">' + esc(b.posting_frequency || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Engagement</div><div class="modal-field-value">' + esc(b.engagement_quality || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Main platform</div><div class="modal-field-value">' + esc(b.main_platform || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Followers</div><div class="modal-field-value">' + (b.followers?.main_platform_label || formatNum(b.followers?.main_platform_count) || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Suggested website</div><div class="modal-field-value">' + esc(b.suggested_website_type || '—') + '</div></div>' +
            '<div class="modal-field"><div class="modal-field-label">Founder / Owner</div><div class="modal-field-value ' + (b.founder_owner ? '' : 'null-val') + '">' + esc(b.founder_owner || 'Unknown') + '</div></div>' +
        '</div></div>' +

        (b.description ? '<div><div class="modal-section-title"><i class="fa-solid fa-align-left"></i> Description</div><div class="obs-box" style="border-color:var(--purple)">' + esc(b.description) + '</div></div>' : '') +

        '<div><div class="modal-section-title"><i class="fa-solid fa-globe-stand"></i> Website Analysis</div><div class="modal-grid">' +
            '<div class="modal-field"><div class="modal-field-label">Website exists</div><div class="modal-field-value" style="color:' + (b.website?.exists ? 'var(--green)' : 'var(--red)') + '"><i class="fa-solid ' + (b.website?.exists ? 'fa-check' : 'fa-xmark') + '"></i> ' + (b.website?.exists ? 'Yes' : 'No') + '</div></div>' +
            (b.website?.url ? '<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value"><a href="' + esc(b.website.url) + '" target="_blank"><i class="fa-solid fa-link"></i> ' + esc(b.website.url) + '</a></div></div>' : '<div class="modal-field"><div class="modal-field-label">URL</div><div class="modal-field-value null-val">None found</div></div>') +
            (b.website?.quality_score != null ? '<div class="modal-field"><div class="modal-field-label">Quality score</div><div class="modal-field-value">' + b.website.quality_score + '/10</div></div>' : '') +
        '</div>' + (b.website?.quality_analysis ? '<div class="obs-box" style="margin-top:8px;border-color:var(--red);font-size:12px"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(b.website.quality_analysis) + '</div>' : '') + '</div>' +

        ((b.website_need_signals || []).length ? '<div><div class="modal-section-title"><i class="fa-solid fa-flag"></i> Why They Need a Website</div><div class="signals-list">' +
            (b.website_need_signals || []).map(s => '<div class="signal-item"><i class="fa-solid fa-warning"></i> ' + esc(s) + '</div>').join('') + '</div></div>' : '') +

        '<div><div class="modal-section-title"><i class="fa-solid fa-address-card"></i> Contact Information</div>' +
            contactRows.map(r => '<div class="contact-row"><div class="contact-icon"><i class="fa-solid ' + r.icon + '"></i></div><div class="contact-info"><div class="contact-type">' + r.type + '</div><div class="contact-val">' + r.val + '</div></div></div>').join('') +
            '<div style="margin-top:6px;font-size:11px;color:var(--text3)"><i class="fa-solid fa-star"></i> Best contact: <strong style="color:var(--text2)">' + esc(b.contact?.best_method || '—') + '</strong></div>' +
        '</div>' +

        (platformLinks ? '<div><div class="modal-section-title"><i class="fa-solid fa-share-nodes"></i> All Social Platforms</div><div class="platforms-list">' + platformLinks + '</div></div>' : '') +

        (b.observations ? '<div><div class="modal-section-title"><i class="fa-solid fa-magnifying-glass"></i> Analyst Observations</div><div class="obs-box"><i class="fa-solid fa-quote-left"></i> ' + esc(b.observations) + '</div></div>' : '') +

        '<div class="modal-footer-actions">' +
            '<button class="modal-btn danger" onclick="openDeleteModal(\'' + b.id + '\')"><i class="fa-solid fa-trash"></i> Delete</button>' +
            '<button class="modal-btn primary" onclick="closeAllModals();openEditModal(\'' + b.id + '\')"><i class="fa-solid fa-pencil"></i> Edit</button>' +
        '</div>',
        'lg'
    );
}

/* ---- EDIT / ADD MODAL ---- */
function openAddModal() {
    editingId = null;
    openModal(
        '<i class="fa-solid fa-plus"></i> Add New Business',
        'Fill in the details below and click Save',
        buildFormHTML(null),
        'xl'
    );
}

function openEditModal(id) {
    const b = bizMap[id];
    if (!b) return;
    editingId = id;
    openModal(
        '<i class="fa-solid fa-pencil"></i> Edit Business',
        b.business_name + '  |  ' + b.id,
        buildFormHTML(b),
        'xl'
    );
}

function buildFormHTML(b) {
    const isEdit = !!b;
    const fid = (field, val) => val ? 'value="' + escAttr(val) + '"' : '';

    return '<form id="biz-form" onsubmit="event.preventDefault();saveBusiness();">' +
        '<div class="form-grid">' +
            '<div class="form-field"><label>Business Name <span class="required">*</span></label><input type="text" id="f-business_name" ' + fid('business_name', b?.business_name) + ' placeholder="e.g. Himalaya Brew Co." required /></div>' +
            '<div class="form-field"><label>Country</label><input type="text" id="f-country" ' + fid('country', b?.country) + ' placeholder="e.g. Nepal" /></div>' +
            '<div class="form-field"><label>City / Region</label><input type="text" id="f-city_region" ' + fid('city_region', b?.city_region) + ' placeholder="e.g. Kathmandu" /></div>' +
            '<div class="form-field"><label>Industry / Niche</label><input type="text" id="f-industry_niche" ' + fid('industry_niche', b?.industry_niche) + ' placeholder="e.g. Food &amp; Beverage" /></div>' +
            '<div class="form-field"><label>Main Platform</label><input type="text" id="f-main_platform" ' + fid('main_platform', b?.main_platform) + ' placeholder="e.g. Instagram" /></div>' +
            '<div class="form-field"><label>Other Platforms (comma sep)</label><input type="text" id="f-other_platforms" ' + fid('other_platforms', (b?.other_platforms || []).join(', ')) + ' placeholder="Facebook, TikTok" /></div>' +
        '</div>' +

        '<div class="form-section-divider"><i class="fa-solid fa-share-nodes"></i> Social Links</div>' +
        '<div class="form-grid">' +
            '<div class="form-field"><label><i class="fa-brands fa-instagram"></i> Instagram URL</label><input type="url" id="f-instagram" ' + fid('instagram', b?.social_links?.instagram) + ' placeholder="https://instagram.com/..." /></div>' +
            '<div class="form-field"><label><i class="fa-brands fa-facebook"></i> Facebook URL</label><input type="url" id="f-facebook" ' + fid('facebook', b?.social_links?.facebook) + ' placeholder="https://facebook.com/..." /></div>' +
            '<div class="form-field"><label><i class="fa-brands fa-tiktok"></i> TikTok URL</label><input type="url" id="f-tiktok" ' + fid('tiktok', b?.social_links?.tiktok) + ' placeholder="https://tiktok.com/..." /></div>' +
            '<div class="form-field"><label><i class="fa-brands fa-youtube"></i> YouTube URL</label><input type="url" id="f-youtube" ' + fid('youtube', b?.social_links?.youtube) + ' placeholder="https://youtube.com/..." /></div>' +
            '<div class="form-field"><label><i class="fa-brands fa-linkedin"></i> LinkedIn URL</label><input type="url" id="f-linkedin" ' + fid('linkedin', b?.social_links?.linkedin) + ' placeholder="https://linkedin.com/..." /></div>' +
            '<div class="form-field"><label><i class="fa-solid fa-users"></i> Followers (main)</label><input type="number" id="f-followers_main" ' + fid('followers_main', b?.followers?.main_platform_count) + ' placeholder="e.g. 12000" /></div>' +
        '</div>' +

        '<div class="form-section-divider"><i class="fa-solid fa-chart-line"></i> Business Metrics</div>' +
        '<div class="form-grid">' +
            '<div class="form-field"><label>Engagement Quality</label><select id="f-engagement_quality"><option value="">-- Select --</option><option value="High"' + (b?.engagement_quality === 'High' ? ' selected' : '') + '>High</option><option value="Medium"' + (b?.engagement_quality === 'Medium' ? ' selected' : '') + '>Medium</option><option value="Low"' + (b?.engagement_quality === 'Low' ? ' selected' : '') + '>Low</option></select></div>' +
            '<div class="form-field"><label>Posting Frequency</label><input type="text" id="f-posting_frequency" ' + fid('posting_frequency', b?.posting_frequency) + ' placeholder="e.g. Daily, 3-5x/week" /></div>' +
            '<div class="form-field"><label>Business Maturity</label><select id="f-business_maturity"><option value="">-- Select --</option><option value="Early-stage"' + (b?.business_maturity === 'Early-stage' ? ' selected' : '') + '>Early-stage</option><option value="Growing"' + (b?.business_maturity === 'Growing' ? ' selected' : '') + '>Growing</option><option value="Established"' + (b?.business_maturity === 'Established' ? ' selected' : '') + '>Established</option></select></div>' +
            '<div class="form-field"><label>Lead Score (1-10)</label><input type="number" id="f-lead_quality_score" min="1" max="10" ' + fid('lead_quality_score', b?.lead_quality_score) + ' placeholder="e.g. 8" /></div>' +
            '<div class="form-field"><label>Conversion Potential</label><select id="f-conversion_potential"><option value="">-- Select --</option><option value="High"' + (b?.conversion_potential === 'High' ? ' selected' : '') + '>High</option><option value="Medium"' + (b?.conversion_potential === 'Medium' ? ' selected' : '') + '>Medium</option><option value="Low"' + (b?.conversion_potential === 'Low' ? ' selected' : '') + '>Low</option></select></div>' +
            '<div class="form-field"><label>Payment Capacity</label><select id="f-payment_capacity"><option value="">-- Select --</option><option value="High"' + (b?.payment_capacity === 'High' ? ' selected' : '') + '>High</option><option value="Medium"' + (b?.payment_capacity === 'Medium' ? ' selected' : '') + '>Medium</option><option value="Low"' + (b?.payment_capacity === 'Low' ? ' selected' : '') + '>Low</option></select></div>' +
        '</div>' +

        '<div class="form-section-divider"><i class="fa-solid fa-globe"></i> Website Info</div>' +
        '<div class="form-grid">' +
            '<div class="form-field"><label>Website Exists</label><select id="f-website_exists"><option value="">-- Select --</option><option value="yes"' + (b?.website?.exists ? ' selected' : '') + '>Yes</option><option value="no"' + (!b?.website?.exists ? ' selected' : '') + '>No</option></select></div>' +
            '<div class="form-field"><label>Website URL</label><input type="url" id="f-website_url" ' + fid('website_url', b?.website?.url) + ' placeholder="https://..." /></div>' +
            '<div class="form-field"><label>Suggested Website Type</label><input type="text" id="f-suggested_website_type" ' + fid('suggested_website_type', b?.suggested_website_type) + ' placeholder="e.g. E-commerce, Portfolio" /></div>' +
        '</div>' +
        '<div class="form-field"><label><i class="fa-solid fa-flag"></i> Website Need Signals (pipe | separated)</label><input type="text" id="f-website_need_signals" ' + fid('website_need_signals', (b?.website_need_signals || []).join(' | ')) + ' placeholder="No e-commerce | No SEO | No catalog" /></div>' +

        '<div class="form-section-divider"><i class="fa-solid fa-address-book"></i> Contact Info</div>' +
        '<div class="form-grid">' +
            '<div class="form-field"><label><i class="fa-solid fa-envelope"></i> Email</label><input type="email" id="f-email" ' + fid('email', b?.contact?.email) + ' placeholder="email@example.com" /></div>' +
            '<div class="form-field"><label><i class="fa-solid fa-phone"></i> Phone</label><input type="text" id="f-phone" ' + fid('phone', b?.contact?.phone) + ' placeholder="+977-98..." /></div>' +
            '<div class="form-field"><label><i class="fa-brands fa-whatsapp"></i> WhatsApp</label><input type="text" id="f-whatsapp" ' + fid('whatsapp', b?.contact?.whatsapp) + ' placeholder="+977-98..." /></div>' +
            '<div class="form-field"><label>Best Contact Method</label><input type="text" id="f-best_method" ' + fid('best_method', b?.contact?.best_method) + ' placeholder="e.g. Instagram DM" /></div>' +
            '<div class="form-field"><label><i class="fa-solid fa-user"></i> Founder / Owner</label><input type="text" id="f-founder_owner" ' + fid('founder_owner', b?.founder_owner) + ' placeholder="e.g. Aarav Shrestha" /></div>' +
        '</div>' +

        '<div class="form-section-divider"><i class="fa-solid fa-pen"></i> Notes</div>' +
        '<div class="form-field" style="margin-bottom:0;"><label>Description</label><textarea id="f-description" rows="3" placeholder="Describe the business...">' + escTextarea(b?.description || '') + '</textarea></div>' +
        '<div class="form-field" style="margin-bottom:0;"><label>Observations</label><textarea id="f-observations" rows="3" placeholder="Analyst notes, recommendations...">' + escTextarea(b?.observations || '') + '</textarea></div>' +

        '<div class="modal-footer-actions">' +
            (isEdit ? '<button type="button" class="modal-btn danger" onclick="openDeleteModal(\'' + b.id + '\')"><i class="fa-solid fa-trash"></i> Delete</button>' : '<span></span>') +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button type="button" class="modal-btn secondary" onclick="closeAllModals()"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
                '<button type="submit" class="modal-btn primary"><i class="fa-solid fa-floppy-disk"></i> ' + (isEdit ? 'Save Changes' : 'Add Business') + '</button>' +
            '</div>' +
        '</div>' +
    '</form>';
}

function escAttr(str) {
    if (str == null) return '';
    return String(str).replace(/"/g, '&quot;');
}

function escTextarea(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveBusiness() {
    const business_name = document.getElementById('f-business_name').value.trim();
    if (!business_name) { showToast('Business name is required.', 'error'); return; }

    const followersRaw = parseInt(document.getElementById('f-followers_main').value) || 0;
    const bizData = {
        id: editingId,
        business_name: business_name,
        country: document.getElementById('f-country').value.trim() || 'Nepal',
        city_region: document.getElementById('f-city_region').value.trim() || '',
        industry_niche: document.getElementById('f-industry_niche').value.trim() || '',
        description: document.getElementById('f-description').value.trim() || '',
        main_platform: document.getElementById('f-main_platform').value.trim() || 'Instagram',
        other_platforms: document.getElementById('f-other_platforms').value.split(',').map(s => s.trim()).filter(Boolean),
        social_links: {
            instagram: document.getElementById('f-instagram').value.trim() || null,
            facebook: document.getElementById('f-facebook').value.trim() || null,
            tiktok: document.getElementById('f-tiktok').value.trim() || null,
            youtube: document.getElementById('f-youtube').value.trim() || null,
            twitter: null,
            linkedin: document.getElementById('f-linkedin').value.trim() || null,
            linktree: null,
            other: null,
        },
        followers: {
            main_platform_count: followersRaw,
            main_platform_label: formatNum(followersRaw),
            total_estimated: followersRaw,
        },
        engagement_quality: document.getElementById('f-engagement_quality').value.trim() || 'Medium',
        posting_frequency: document.getElementById('f-posting_frequency').value.trim() || '3-5x/week',
        website: {
            exists: document.getElementById('f-website_exists').value === 'yes',
            url: document.getElementById('f-website_url').value.trim() || null,
            quality_score: null,
            quality_analysis: null,
        },
        website_need_signals: document.getElementById('f-website_need_signals').value.split('|').map(s => s.trim()).filter(Boolean),
        suggested_website_type: document.getElementById('f-suggested_website_type').value.trim() || '',
        business_maturity: document.getElementById('f-business_maturity').value.trim() || 'Growing',
        contact: {
            email: document.getElementById('f-email').value.trim() || null,
            phone: document.getElementById('f-phone').value.trim() || null,
            whatsapp: document.getElementById('f-whatsapp').value.trim() || null,
            best_method: document.getElementById('f-best_method').value.trim() || 'Instagram DM',
        },
        founder_owner: document.getElementById('f-founder_owner').value.trim() || null,
        lead_quality_score: parseInt(document.getElementById('f-lead_quality_score').value) || 5,
        conversion_potential: document.getElementById('f-conversion_potential').value.trim() || 'Medium',
        payment_capacity: document.getElementById('f-payment_capacity').value.trim() || 'Medium',
        observations: document.getElementById('f-observations').value.trim() || '',
    };

    if (editingId) {
        apiCall({ action: 'update_business', business_id: editingId, data: bizData }, function (data) {
            if (data && data.status === 'ok') {
                bizMap[editingId] = bizData;
                const idx = DB.businesses.findIndex(b => b.id === editingId);
                if (idx !== -1) DB.businesses[idx] = bizData;
                buildCharts(DB.businesses);
                renderGrid();
                closeAllModals();
                showToast('Business updated successfully.', 'success');
            } else {
                showToast('Update failed: ' + (data ? data.error : 'Server error'), 'error');
            }
        });
    } else {
        const bizDataNew = Object.assign({}, bizData);
        delete bizDataNew.id;
        apiCall({ action: 'add_business', data: bizDataNew }, function (data) {
            if (data && data.status === 'ok') {
                const newId = data.new_id || bizDataNew.id;
                bizDataNew.id = newId;
                bizMap[newId] = bizDataNew;
                DB.businesses.push(bizDataNew);
                filteredBizList = [...DB.businesses];
                buildFilters(DB.businesses);
                buildCharts(DB.businesses);
                renderGrid();
                closeAllModals();
                showToast('Business added successfully.', 'success');
            } else {
                showToast('Add failed: ' + (data ? data.error : 'Server error'), 'error');
            }
        });
    }
}

/* ---- DELETE MODAL ---- */
function openDeleteModal(id) {
    const b = bizMap[id];
    if (!b) return;

    openModal(
        '<i class="fa-solid fa-triangle-exclamation"></i> Delete Business',
        'This action cannot be undone',
        '<div class="delete-modal-content">' +
            '<div class="delete-modal-icon"><i class="fa-solid fa-trash"></i></div>' +
            '<p class="delete-modal-text">Are you sure you want to delete <strong>"' + esc(b.business_name) + '"</strong>?</p>' +
            '<p class="delete-modal-subtext">This entry will be permanently removed from data.json.</p>' +
            '<div class="modal-footer-actions">' +
                '<button class="modal-btn secondary" onclick="closeAllModals()"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
                '<button class="modal-btn danger" onclick="executeDelete(\'' + id + '\')"><i class="fa-solid fa-trash"></i> Yes, Delete</button>' +
            '</div>' +
        '</div>',
        'sm'
    );
}

function executeDelete(id) {
    apiCall({ action: 'delete_business', business_id: id }, function (data) {
        if (data && data.status === 'ok') {
            delete bizMap[id];
            DB.businesses = DB.businesses.filter(b => b.id !== id);
            filteredBizList = filteredBizList.filter(b => b.id !== id);
            buildCharts(DB.businesses);
            renderGrid();
            closeAllModals();
            showToast('Business deleted.', 'success');
        } else {
            showToast('Delete failed: ' + (data ? data.error : 'Server error'), 'error');
        }
    });
}

/* ---- RAW JSON MODAL ---- */
function openJsonModal() {
    openModal(
        '<i class="fa-solid fa-code"></i> Edit Raw JSON',
        'Edit data.json directly  |  Use with caution',
        '<div class="json-editor-wrap">' +
            '<div class="json-editor-hint"><i class="fa-solid fa-triangle-exclamation"></i> Edit the JSON below carefully. Invalid JSON will fail to save. Changes apply to data.json immediately.</div>' +
            '<textarea id="raw-json-editor" class="json-textarea" spellcheck="false"></textarea>' +
            '<div id="raw-json-error" class="json-error"></div>' +
        '</div>' +
        '<div class="modal-footer-actions">' +
            '<button class="modal-btn secondary" onclick="closeAllModals()"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
            '<button class="modal-btn primary" onclick="saveRawJson()"><i class="fa-solid fa-floppy-disk"></i> Save JSON</button>' +
        '</div>',
        'xl'
    );
    document.getElementById('raw-json-editor').value = JSON.stringify(DB, null, 2);
}

function saveRawJson() {
    const raw = document.getElementById('raw-json-editor').value.trim();
    const errorEl = document.getElementById('raw-json-error');
    errorEl.style.display = 'none';

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { errorEl.textContent = 'Invalid JSON: ' + e.message; errorEl.style.display = 'block'; return; }

    if (!parsed.businesses || !Array.isArray(parsed.businesses)) {
        errorEl.textContent = 'JSON must contain a "businesses" array.'; errorEl.style.display = 'block'; return;
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
            closeAllModals();
            showToast('JSON saved to data.json.', 'success');
        } else {
            errorEl.textContent = 'Save failed: ' + (data ? data.error : 'Server error'); errorEl.style.display = 'block';
        }
    });
}

/* ---- ANALYSIS ---- */
function buildAnalysis(analysis, biz) {
    const grid = document.getElementById('analysis-grid');
    const cards = [];

    function topListCard(title, icon, ids, colorClass) {
        if (!ids || !ids.length) return '';
        const items = ids.map((id, i) => {
            const b = bizMap[id];
            if (!b) return '';
            return '<div class="top-biz-item" onclick="openViewModal(\'' + id + '\')">' +
                '<span class="top-biz-rank">#' + (i + 1) + '</span>' +
                '<span class="top-biz-name">' + esc(b.business_name) + '</span>' +
                '<span class="top-biz-score" style="color:' + colorClass + '">' + (b.lead_quality_score || '—') + '</span>' +
            '</div>';
        }).join('');
        return '<div class="analysis-card"><div class="analysis-card-title"><i class="fa-solid ' + icon + '"></i> ' + title + '</div><div class="top-biz-list">' + items + '</div></div>';
    }

    cards.push(topListCard('Top 15 Highest Potential', 'fa-trophy', analysis.top_15_highest_potential, 'var(--green)'));
    cards.push(topListCard('Easiest to Approach', 'fa-hand-wave', analysis.top_10_easiest_approach, 'var(--teal)'));
    cards.push(topListCard('Most Likely to Pay', 'fa-sack-dollar', analysis.top_10_likely_to_pay, 'var(--yellow)'));
    cards.push(topListCard('Best for E-Commerce', 'fa-cart-shopping', analysis.top_10_ecommerce, 'var(--purple)'));
    cards.push(topListCard('Best for SEO + AdSense', 'fa-chart-line-up', analysis.top_10_seo_adsense, 'var(--accent)'));
    cards.push(topListCard('Most Underserved Digitally', 'fa-globe', analysis.most_underserved_digital, 'var(--pink)'));
    cards.push(topListCard('Fastest Growth Signals', 'fa-rocket', analysis.fastest_growth_signals, 'var(--orange)'));

    if ((analysis.common_patterns || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><i class="fa-solid fa-magnifying-glass"></i> Common Patterns Discovered</div><div class="pattern-list">' +
            analysis.common_patterns.map(p => '<div class="pattern-item"><i class="fa-solid fa-magnifying-glass-chart"></i> ' + esc(p) + '</div>').join('') + '</div></div>');
    }
    if ((analysis.biggest_problems || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><i class="fa-solid fa-triangle-exclamation"></i> Biggest Website Problems</div><div class="pattern-list">' +
            analysis.biggest_problems.map(p => '<div class="problem-item"><i class="fa-solid fa-warning"></i> ' + esc(p) + '</div>').join('') + '</div></div>');
    }
    if ((analysis.outreach_strategies || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><i class="fa-solid fa-bullhorn"></i> Best Outreach Strategies</div><div class="strategy-list">' +
            analysis.outreach_strategies.map(p => '<div class="strategy-item"><i class="fa-solid fa-megaphone"></i> ' + esc(p) + '</div>').join('') + '</div></div>');
    }
    if ((analysis.best_industries_to_target_first || []).length) {
        cards.push('<div class="analysis-card"><div class="analysis-card-title"><i class="fa-solid fa-bullseye"></i> Best Industries to Target First</div><div>' +
            analysis.best_industries_to_target_first.map(i => '<span class="industry-pill"><i class="fa-solid fa-crosshairs"></i> ' + esc(i) + '</span>').join('') + '</div></div>');
    }
    if (analysis.approach_strategy_for_beginners) {
        cards.push('<div class="analysis-card" style="grid-column:1/-1"><div class="analysis-card-title"><i class="fa-solid fa-lightbulb"></i> Approach Strategy for Beginners</div><div class="approach-box"><i class="fa-solid fa-graduation-cap"></i> ' + esc(analysis.approach_strategy_for_beginners) + '</div></div>');
    }

    grid.innerHTML = cards.filter(Boolean).join('');
}

/* ---- UTILS ---- */
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
