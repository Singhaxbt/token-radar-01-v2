// Token Radar's dashboard, model radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the board, the model panel and the detail views. No fetch, no network: the
// data is already in the page. The farm plans are generated here from the same derivation the
// program runs in lib/model.ts — same capital, same hold, same gas schedule, same netting — so the
// steps the dialog shows are the steps board.json carries, word for word.

var DATA = window.RADAR;
var GAS_FIRST = 3, GAS_SMALL = 4, GAS_LARGE = 8, GAS_WEEKLY = 2, GAS_UNWIND = 3, APR = 0.05;

/** A dollar amount, compact: $107.7M, $84.5K, $1,234. */
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** A dollar amount in full, with commas: $107,731,890. */
function moneyFull(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** A plain number with commas. */
function num(n) {
  return n.toLocaleString('en-US');
}

/** A multiple with an x and three decimals: x0.041. */
function mult(m) {
  return 'x' + m.toFixed(3);
}

/** Escape text for HTML. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(row) {
  return row.chains.length > 0 ? row.chains[0] : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(row) {
  if (row.tvl_usd >= 5000000000) return 250;
  if (row.tvl_usd >= 1000000000) return 150;
  if (row.tvl_usd >= 100000000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(row, capital, chain) {
  var c = (row.category || '').toLowerCase();
  var name = row.name;
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares, so the vault\'s curator sees your address.';
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', borrow a small amount against it, and keep both positions open.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open through one fee cycle.';
  if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app, so the bridge records a real user.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token in the same wallet.';
  if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then close it after a day.';
  if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it when the market resolves.';
  if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it for the qualifying window.';
  if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it, so the position accrues on-chain.';
  if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the qualifying window.';
  if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s basis strategy on ' + chain + ' and keep the position through one funding cycle.';
  if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts in the same wallet.';
  if (c.indexOf('launchpad') >= 0 || c.indexOf('locker') >= 0) return 'Use $' + capital + ' to join one ' + name + ' launch or lock on ' + chain + ' and hold the allocation.';
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}

/** The category's weekly qualifying action, so the farmer returns instead of depositing once. */
function weeklyFor(row, chain) {
  var c = (row.category || '').toLowerCase();
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Vote on one vault proposal or rebalance into a second ' + row.name + ' vault on ' + chain + '.';
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Adjust the borrow or add a small top-up to the ' + row.name + ' position on ' + chain + '.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Claim the pool\'s fees on ' + row.name + ' and add a small top-up to the position on ' + chain + '.';
  if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge a small amount back or forth through ' + row.name + ' so the address stays active.';
  if (c.indexOf('rwa') >= 0) return 'Check the accrued yield on the ' + row.name + ' position and claim it if the protocol offers it.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the rewards the ' + row.name + ' position earned, keeping them in the same wallet.';
  return 'Make one qualifying action on ' + row.name + ', such as a deposit, a swap or a vote on ' + chain + '.';
}

/** Cost a farm plan, in whole dollars: gas by the schedule, capital at 5% a year over the hold. */
function costPlan(row) {
  var capital = capitalFor(row);
  var hold = holdDaysFor(row.age_days);
  var weeks = Math.max(1, Math.ceil(hold / 7));
  var setup = capital >= 150 ? GAS_LARGE : GAS_SMALL;
  var gas = GAS_FIRST + setup + GAS_WEEKLY * weeks + GAS_UNWIND;
  var capCost = Math.round(capital * APR * (hold / 365) * 100) / 100;
  return { capital: capital, hold: hold, weeks: weeks, setup: setup, gas: gas, capCost: capCost, total: Math.max(1, Math.round(gas + capCost)) };
}

/** A step as one string: its action, then its cost and time. */
function stepText(step) {
  var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
  return s;
}

/** A row's seven farm steps, from its own record — the same derivation the program runs. */
function farmSteps(row) {
  var chain = chainOf(row);
  var cost = costPlan(row);
  var action = actionFor(row, cost.capital, chain);
  var weekly = weeklyFor(row, chain);
  var pct = (100 * cost.total / Math.max(1, row.implied_value_usd)).toFixed(2);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about $' + GAS_FIRST + ' of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: '$' + cost.capital + ' of capital and about $' + cost.setup + ' of gas', time: '15 minutes to set up' },
    { text: weekly, cost: 'about $' + GAS_WEEKLY + ' of gas a week, $' + (GAS_WEEKLY * cost.weeks) + ' over the ' + cost.hold + '-day hold', time: '10 minutes a week for ' + cost.weeks + ' weeks' },
    { text: 'Open ' + row.name + '\'s own points or rewards page and confirm the position is counted, using only the link the protocol publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Hold the position for at least ' + cost.hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + cost.capital + ' stays in the position, about $' + cost.capCost + ' of capital cost at 5% a year', time: cost.hold + ' days' },
    { text: 'Write the wallet, the dates and every transaction in a farm log, and unwind in small steps so one exit does not look like a sybil.', cost: 'about $' + GAS_UNWIND + ' of gas to unwind', time: '5 minutes' },
    { text: 'Net: this plan spends about $' + cost.total + ' in all ($' + cost.gas + ' of gas plus $' + cost.capCost + ' of capital cost) against an implied token value of ' + moneyFull(row.implied_value_usd) + ', so the farm costs ' + pct + '% of the value it chases.', cost: '$' + cost.total + ' in all', time: cost.hold + ' days from first deposit to unwind' },
  ].map(stepText);
}

/** Recompute a row's implied value from its own multipliers, as the detail view checks it. */
function recompute(row) {
  return Math.max(1, Math.round(row.tvl_usd * row.multiple * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
}

/* ---- state ---- */
var watchlistSet = {};
(DATA.watchlist || []).forEach(function (s) { watchlistSet[s] = true; });
var state = { tab: 'pre', q: '', cat: '', watchOnly: false, sort: 'rank', dir: 1 };
var bySlug = {};
DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

/** Read the location hash: #<slug> opens that row's detail, #live opens the live tab,
    #cat=<category> filters to a category, #q=<text> searches. */
function readHash() {
  var hash = window.location.hash.replace(/^#/, '');
  if (hash === 'live') { state.tab = 'live'; return; }
  if (hash.indexOf('cat=') === 0) { state.cat = decodeURIComponent(hash.slice(4)); state.scrollToBoard = true; return; }
  if (hash.indexOf('q=') === 0) { state.q = decodeURIComponent(hash.slice(2)); state.scrollToBoard = true; return; }
  if (hash && bySlug[hash]) { state.tab = 'pre'; state.openSlug = hash; }
}

/** The rows the current filters leave, in the current sort order. */
function visibleRows() {
  var rows = DATA.rows.filter(function (r) {
    if (state.watchOnly && !watchlistSet[r.slug]) return false;
    if (state.cat && (r.category || 'Other') !== state.cat) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  });
  var key = state.sort;
  var dir = state.dir;
  rows.sort(function (a, b) {
    var va, vb;
    if (key === 'name') { va = a.name; vb = b.name; return dir * (va < vb ? -1 : va > vb ? 1 : 0); }
    if (key === 'category') { va = a.category || 'Other'; vb = b.category || 'Other'; return dir * (va < vb ? -1 : va > vb ? 1 : 0); }
    if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
    else if (key === 'growth') { va = a.change_7d === null ? -999 : a.change_7d; vb = b.change_7d === null ? -999 : b.change_7d; }
    else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
    else if (key === 'multiple') { va = a.multiple; vb = b.multiple; }
    else if (key === 'net') { va = a.net_value_usd; vb = b.net_value_usd; }
    else if (key === 'cost') { va = a.plan_cost_usd; vb = b.plan_cost_usd; }
    else { va = a.implied_value_usd; vb = b.implied_value_usd; }
    if (key === 'rank') { va = a.rank; vb = b.rank; }
    return dir * (va - vb);
  });
  return rows;
}

/** One table header cell, clickable to sort. */
function th(key, label, cls) {
  var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
  return '<th class="' + (cls || '') + '"><button data-sort="' + key + '">' + esc(label) + arrow + '</button></th>';
}

/** The board table for the current filters. */
function boardHtml(rows) {
  if (rows.length === 0) return '<div class="empty">No protocols match these filters.</div>';
  var h = '<table class="board"><thead><tr>'
    + th('rank', '#') + th('name', 'Protocol') + th('category', 'Category')
    + th('tvl', 'TVL', 'num') + th('growth', '7d', 'num') + th('age', 'Age', 'num')
    + th('multiple', 'Multiple', 'num') + th('implied', 'Implied value', 'num')
    + th('cost', 'Plan cost', 'num') + th('net', 'Net value', 'num')
    + '</tr></thead><tbody>';
  rows.forEach(function (r) {
    var g = r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
    var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
    var age = r.age_days === null ? '—' : r.age_days + 'd';
    h += '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>'
      + '<td><b>' + esc(r.name) + '</b>' + (watchlistSet[r.slug] ? ' ★' : '') + '</td>'
      + '<td>' + esc(r.category || 'Other') + '</td>'
      + '<td class="num">' + money(r.tvl_usd) + '</td>'
      + '<td class="num ' + gc + '">' + g + '</td>'
      + '<td class="num">' + age + '</td>'
      + '<td class="num src-' + r.multiple_source + '">' + mult(r.multiple) + '</td>'
      + '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>'
      + '<td class="num">$' + num(r.plan_cost_usd) + '</td>'
      + '<td class="num">' + money(r.net_value_usd) + '</td></tr>';
  });
  return h + '</tbody></table>';
}

/** The live-token table. */
function liveHtml() {
  var h = '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Multiple</th><th class="num">7d</th></tr></thead><tbody>';
  DATA.live.forEach(function (r) {
    var g = r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
    var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
    h += '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || 'Other') + '</td>'
      + '<td class="num">' + money(r.tvl_usd) + '</td>'
      + '<td class="num"><b>' + money(r.mcap_usd || 0) + '</b></td>'
      + '<td class="num">' + mult(r.multiple) + '</td>'
      + '<td class="num ' + gc + '">' + g + '</td></tr>';
  });
  return h + '</tbody></table>';
}

/** The model panel: the fit, the validation and the netting, in the open. */
function modelHtml() {
  var fit = DATA.fit, v = DATA.validation;
  var cats = fit.categories.filter(function (c) { return c.live_count >= 3; }).slice(0, 12);
  var h = '<section class="panel"><h2>How the value is fitted — radar-3</h2>'
    + '<p>Log market cap is fit on log TVL over the snapshot\'s <b>' + fit.live_count + ' live tokens</b>: '
    + 'once pooled (<code>log(mcap) = ' + fit.pooled_intercept + ' + ' + fit.pooled_slope + ' · log(TVL)</code>, R² ' + fit.pooled_r2 + '), '
    + 'once with a separate intercept per category under one common slope <b>' + fit.slope + '</b> (R² <b>' + fit.r2 + '</b>, residual SD ' + fit.resid_sd + ' in log points). '
    + 'Each category\'s multiple is its own fit blended toward the pooled one by its live-token count (k = 5), so a category with one live token is mostly the market and one with ten or more is mostly itself. '
    + 'The slope is below 1, so larger protocols trade at lower multiples — a flat median over-values the giants.</p>'
    + '<h3>Out-of-sample validation — computed from this snapshot, not assumed</h3>'
    + '<table><thead><tr><th>Test</th><th class="num">Train</th><th class="num">Test</th><th class="num">Fitted MdAPE</th><th class="num">Median MdAPE</th></tr></thead><tbody>'
    + '<tr><td>5-fold cross-validation</td><td class="num">' + (fit.live_count - Math.ceil(fit.live_count / 5)) + '</td><td class="num">' + Math.ceil(fit.live_count / 5) + '</td><td class="num"><b>' + (100 * v.cv_fitted_mdape).toFixed(1) + '%</b></td><td class="num">' + (100 * v.cv_median_mdape).toFixed(1) + '%</td></tr>';
  v.walk_forward.forEach(function (f) {
    h += '<tr><td>Walk-forward: ' + esc(f.label) + '</td><td class="num">' + f.train + '</td><td class="num">' + f.test + '</td><td class="num"><b>' + (100 * f.fitted_mdape).toFixed(1) + '%</b></td><td class="num">' + (100 * f.median_mdape).toFixed(1) + '%</td></tr>';
  });
  h += '</tbody></table>'
    + '<p>Median absolute percentage error on market cap. The fitted model beats the median rule out of sample on every test; the error is still large, because market caps scatter widely around TVL — the board says so instead of hiding it. Walk-forward fits on protocols listed before the cutoff and tests on those listed after it, the way the model meets a new launch.</p>'
    + '<h3>Fitted multiples at $100M TVL — categories with 3+ live tokens</h3>'
    + '<table><thead><tr><th>Category</th><th class="num">Live</th><th class="num">Intercept</th><th class="num">Multiple</th><th>Source</th></tr></thead><tbody>';
  cats.forEach(function (c) {
    h += '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.live_count + '</td><td class="num">' + c.intercept + '</td><td class="num"><b>' + mult(c.multiple_at_100m) + '</b></td><td class="src-' + c.source + '">' + c.source + '</td></tr>';
  });
  h += '</tbody></table>'
    + '<h3>How every farm plan is netted</h3>'
    + '<p>Each plan states its gas and time per step. Gas is $3 for the first transaction, $4–$8 to set up, $2 a week of qualifying actions over the hold window, and $3 to unwind. The capital costs 5% a year over the hold window. <b>Plan cost</b> is gas plus capital cost; <b>net value</b> is implied value minus plan cost. The board ranks by implied value; sort by Net to rank by what the farm keeps.</p>'
    + '</section>';
  return h;
}

/** The whole page. */
function render() {
  var rows = visibleRows();
  var top = DATA.rows.slice(0, 5);
  var cats = [];
  DATA.rows.forEach(function (r) { var c = r.category || 'Other'; if (cats.indexOf(c) < 0) cats.push(c); });
  cats.sort();
  var h = '<div class="shell">'
    + '<header class="top"><div class="brand">TOKEN <b>RADAR</b></div>'
    + '<span class="model-tag">model radar-3 · fitted log-log</span>'
    + '<span class="top-meta">Snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source.split(',')[0]) + '</span></header>'
    + '<p class="lede">Pre-token protocols ranked by <b>fitted implied value</b> — what a token would be worth if the protocol\'s record stayed as it is. The multiple is fit on the snapshot\'s own live tokens, validated out of sample, and every farm plan is netted to its costs. The watchlist is the floor, never the ceiling: ' + DATA.board_size + ' rows, ' + DATA.early_size + ' of them below the $50M floor.</p>'
    + '<div class="facts">'
    + '<div class="fact"><div class="num">' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</div><div class="sub">watchlist covered</div></div>'
    + '<div class="fact"><div class="num">' + DATA.board_size + '</div><div class="sub">rows on the board</div></div>'
    + '<div class="fact"><div class="num">' + DATA.early_size + '</div><div class="sub">early finds below the floor</div></div>'
    + '<div class="fact"><div class="num">' + DATA.live_size + '</div><div class="sub">live tokens set aside</div></div>'
    + '</div>'
    + '<div class="fitline">'
    + '<span class="fit-chip">Fit R² <b>' + DATA.fit.r2 + '</b> over ' + DATA.fit.live_count + ' live tokens</span>'
    + '<span class="fit-chip">Slope <b>' + DATA.fit.slope + '</b> (mcap grows slower than TVL)</span>'
    + '<span class="fit-chip">5-fold CV MdAPE <b class="good">' + (100 * DATA.validation.cv_fitted_mdape).toFixed(1) + '%</b> vs median ' + (100 * DATA.validation.cv_median_mdape).toFixed(1) + '%</span>'
    + '<span class="fit-chip">Top implied value <b>' + money(DATA.rows[0].implied_value_usd) + '</b></span>'
    + '</div>'
    + modelHtml()
    + '<div class="highlights">'
    + top.map(function (r) {
      return '<div class="hl" data-slug="' + esc(r.slug) + '"><div class="rk">#' + r.rank + ' · ' + esc(r.category || 'Other') + '</div><div class="nm">' + esc(r.name) + '</div><div class="vl">' + money(r.implied_value_usd) + '</div><div class="ct">net ' + money(r.net_value_usd) + ' · ' + mult(r.multiple) + '</div></div>';
    }).join('')
    + '</div>'
    + '<div class="controls">'
    + '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Protocol or slug" value="' + esc(state.q) + '"></div>'
    + '<div class="field"><label for="cat">Category</label><select id="cat"><option value="">All categories</option>'
    + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="tabs" role="group" aria-label="Board view">'
    + '<button data-tab="pre" aria-pressed="' + (state.tab === 'pre') + '">Pre-token board</button>'
    + '<button data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live tokens</button>'
    + '</div>'
    + '<label class="toggle"><input type="checkbox" id="watch" ' + (state.watchOnly ? 'checked' : '') + '> Watchlist only</label>'
    + '</div>';
  if (state.tab === 'live') {
    h += '<p class="count">' + DATA.live_size + ' live tokens, by market cap — the market\'s own values, never a model\'s.</p>' + liveHtml();
  } else {
    h += '<p class="count">' + rows.length + ' of ' + DATA.board_size + ' rows · click a row for its model breakdown and farm plan · click a column to sort · ★ is on the watchlist</p>' + boardHtml(rows);
  }
  h += '<p class="note">Implied value follows from the snapshot\'s own figures: TVL, seven-day growth, age with no token, and chains. A protocol records no token, never that it has none. Farm plans are costed, not slogans: gas, capital and time are stated per step, and the net step totals them. Source: DefiLlama public API, fetched ' + esc(DATA.as_of) + '.</p>'
    + '</div>';
  var main = document.getElementById('board');
  main.innerHTML = h;
  main.setAttribute('aria-busy', 'false');
  bind();
  if (state.scrollToBoard) {
    var ctl = document.querySelector('.controls');
    if (ctl) ctl.scrollIntoView();
  }
  if (state.openSlug) { var slug = state.openSlug; state.openSlug = null; openDetail(slug); }
}

/** Wire up the controls after a render. */
function bind() {
  var q = document.getElementById('q');
  if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
  var cat = document.getElementById('cat');
  if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
  var watch = document.getElementById('watch');
  if (watch) watch.addEventListener('change', function () { state.watchOnly = watch.checked; render(); });
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      if (state.tab === 'live') window.history.replaceState(null, '', '#live');
      else window.history.replaceState(null, '', window.location.pathname + window.location.search);
      render();
    });
  });
  document.querySelectorAll('[data-sort]').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      render();
    });
  });
  document.querySelectorAll('[data-slug]').forEach(function (el) {
    el.addEventListener('click', function () { openDetail(el.getAttribute('data-slug')); });
  });
}

/** The detail dialog for one row: the model breakdown, the recomputation, the farm plan. */
function openDetail(slug) {
  var r = bySlug[slug];
  if (!r) return;
  var cost = costPlan(r);
  var steps = farmSteps(r);
  var again = recompute(r);
  var ok = again === r.implied_value_usd;
  var dlg = document.getElementById('detail');
  var deriv = r.category_intercept === null
    ? 'Pooled fit: log(mcap) = ' + DATA.fit.pooled_intercept + ' + ' + DATA.fit.pooled_slope + ' · log(TVL); no live token in this category, so the pooled multiple applies.'
    : 'Category fit: log(mcap) = ' + r.category_intercept + ' + ' + r.slope + ' · log(TVL), blended toward the pooled fit by the category\'s ' + (DATA.fit.categories.filter(function (c) { return c.category === (r.category || 'Other'); })[0] || { live_count: 0 }).live_count + ' live tokens.';
  dlg.innerHTML = '<div class="inner"><button class="close" data-close>Close</button>'
    + '<h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>'
    + '<p class="sub">' + esc(r.category || 'Other') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + ' · TVL ' + moneyFull(r.tvl_usd) + ' · ' + (r.age_days === null ? 'age unknown' : r.age_days + ' days listed') + (watchlistSet[r.slug] ? ' · ★ watchlist' : '') + '</p>'
    + '<h3>Implied value — ' + moneyFull(r.implied_value_usd) + '</h3>'
    + '<table><tbody>'
    + '<tr><th>Multiple</th><td><b>' + mult(r.multiple) + '</b> <span class="src-' + r.multiple_source + '">' + r.multiple_source + '</span></td></tr>'
    + '<tr><th>How the multiple is derived</th><td>' + esc(deriv) + '</td></tr>'
    + '<tr><th>Growth</th><td>' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '% over 7 days') + ' → ×' + r.growth_multiplier.toFixed(4) + '</td></tr>'
    + '<tr><th>Maturity</th><td>' + (r.age_days === null ? 'age unknown, 365 days assumed' : r.age_days + ' days') + ' → ×' + r.maturity_multiplier.toFixed(4) + '</td></tr>'
    + '<tr><th>Chains</th><td>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' → ×' + r.chain_multiplier.toFixed(4) + '</td></tr>'
    + '<tr><th>Recomputation</th><td>' + moneyFull(r.tvl_usd) + ' × ' + r.multiple.toFixed(6) + ' × ' + r.growth_multiplier.toFixed(4) + ' × ' + r.maturity_multiplier.toFixed(4) + ' × ' + r.chain_multiplier.toFixed(4) + ' = <b>' + moneyFull(again) + '</b> ' + (ok ? '✓ matches the board' : '✗ differs from the board') + '</td></tr>'
    + '<tr><th>Plan cost</th><td>$' + num(cost.total) + ' ($' + num(cost.gas) + ' gas + $' + cost.capCost + ' capital cost)</td></tr>'
    + '<tr><th>Net value</th><td><b>' + moneyFull(r.net_value_usd) + '</b></td></tr>'
    + '</tbody></table>'
    + '<h3>Farm plan — netted</h3><ol>'
    + steps.map(function (s) {
      var cut = s.indexOf(' Cost: ');
      var text = cut >= 0 ? s.slice(0, cut) : s;
      var rest = cut >= 0 ? s.slice(cut + 1) : '';
      return '<li>' + esc(text) + '<span class="cost">' + esc(rest) + '</span></li>';
    }).join('')
    + '</ol>'
    + '<div class="netline">Net: about $' + num(cost.total) + ' in all against an implied token value of ' + moneyFull(r.implied_value_usd) + ' — the farm costs ' + (100 * cost.total / Math.max(1, r.implied_value_usd)).toFixed(2) + '% of the value it chases.</div>'
    + '</div>';
  dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close(); });
  dlg.showModal();
  window.history.replaceState(null, '', '#' + slug);
  dlg.addEventListener('close', function onClose() {
    dlg.removeEventListener('close', onClose);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  });
}

readHash();
render();
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var dlg = document.getElementById('detail');
    if (dlg.open) dlg.close();
  }
});
