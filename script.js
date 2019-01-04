
var jsont; // JSONPコールバック関数公開用

(function (window, $) {
	
	var String = this.String;
	var Date   = this.Date;
	
	var isNaN = this.isNaN;
	var parseInt   = this.parseInt;
	var parseFloat = this.parseFloat;
	
	var decode = this.decodeURIComponent;
	
	var webkit = 'webkit', moz = 'moz';
	function prefix(object, key, vendors) {
		if (key in object) {
			return key;
		}
		var uc = key.charAt(0).toUpperCase() + key.substr(1);
		var l = vendors.length;
		for (var i = 0; i < l; i++) {
			var prefixed = vendors[i] + uc;
			if (prefixed in object) {
				return prefixed;
			}
		}
		return key;
	}
	
	var AudioContext = this[prefix(this, 'AudioContext', [webkit])];
	var Utterance = this.SpeechSynthesisUtterance;
	
	// 設定
	
	// 表示更新間隔
	var interval = 43;
	
	// 時刻取得タイムアウト
	var period = 1000;
	
	var lang = 'ja-JP';
	var langRe = /^ja([-_].*)?$/i;
	
	
	var date = new Date(0);
	var lag = -new Date(70, 0);
	var days = ['日', '月', '火', '水', '木', '金', '土'];
	
	var inputTag = 'INPUT', selectTag = 'SELECT';
	var location = window.location;
	
	var hidden = prefix($, 'hidden', [webkit, moz]);
	var visibilitychange = hidden.slice(0, -6) + 'visibilitychange';
	
	var context; var destination;
	var speechSynthesis = window.speechSynthesis;
	var voices = []; var voice;
	
	// 設定画面
	
	var pref; // #pref要素
	var refetch;            // #refetch要素 再取得ボタン
	var diffText, lastText; // 補正, 最終更新 TextNode
	var logTexts = [];      // 時刻補正ログ TextNode[]
	
	var select;
	var voiceURI;
	var params = {pitch: 1, rate: 1};
	
	// 文字列
	function dstr(d) { // 符号反転
		return (d < 0 ? '+' : '') + -d;
	}
	function rstr(d, r) { // 時差, RTT
		return dstr(d) + ' ± ' + (r + r % 2) / 2;
	}
	
	// 表示更新
	function result() {
		diffText.data = dstr(diff);
	}
	function log(i, str) {
		logTexts[i].data = str;
	}
	
	function selectVoice() {
		voice = voices[select.selectedIndex];
	}
	
	function onvoiceschanged() {
		var vs = this.getVoices();
		var restore = false;
		var sel = 0, i;
		voices.length = 0;
		for (i = select.length - 1; i >= 0; i--) {
			select.remove(i);
		}
		
		for (i = 0; i < vs.length; i++) {
			var v = vs[i];
			if (!v.lang || langRe.test(v.lang)) {
				var l = voices.push(v);
				var name = v.name;
				var uri  = v.voiceURI;
				var def  = v['default'];
				
				var option = $.createElement('option');
				option.appendChild($.createTextNode(
					def ? name + ' （既定値）' : name));
				select.add(option);
				
				if (uri == voiceURI) {
					restore = true;
					sel = l;
					voiceURI = null;
				}
				if (restore) continue;
				restore = voice && uri == voice.voiceURI;
				if (restore || !sel && def) {
					sel = l;
				}
			}
		}
		if (sel) {
			select.selectedIndex = sel - 1;
		}
		selectVoice();
	}
	
	function onchangeVoice() {
		voiceURI = null;
		selectVoice();
	}
	
	function toFixed(number) {
		return number.toFixed(1);
	}
	function bind(id) {
		var param = params[id];
		var input = $.getElementById(id + '-t');
		var range = $.getElementById(id);
		input.value = input.placeholder = toFixed(param);
		range.value = range.defaultValue = param;
		
		input.oninput = function () {
			if (!this.value || isNaN(this.value)) {
				range.value = param;
				params[id]  = param;
				return;
			}
			range.value = this.value;
			params[id] = +range.value;
		};
		input.onchange = function () {
			this.oninput();
			this.value = toFixed(params[id]);
		};
		range.oninput = function () {
			input.value = toFixed(+this.value);
		};
		range.onchange = function () {
			var value = +this.value;
			input.value = toFixed(value);
			params[id] = value;
		};
	}
	
	var config = {
		s: true, d: 10, f: 0,
		t: false, m: false,
		y: false, a: 3,
		
		k: false, k1: 21, k2: 6,
		h0: false, h1: false, h2: false, h3: false,
		h4: false, h5: false, h6: false,
		
		v: true, i: 10, n: 0, p: 0,
		j: false, z: false,
		x: false,
		l: false, g: false, r: false,
		c: false, w: false,
		
		_: false
	};
	var inputs = {};
	
	var xids = [
		's', 'v', 't', 'm', 'y',
		'j', 'l', 'x', 'c', '_', 'w', 'z', 'g', 'r'
	];
	var wids = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
	
	var c0 = '0', c1 = '1';
	
	function alt(altKey) {
		pref.className = altKey ? 'alt' : '';
	}
	
	function onkeydown(event) {
		if (!event) event = window.event;
		var altKey = event.altKey;
		alt(altKey);
		
		var key = String.fromCharCode(event.keyCode | 32);
		if (key in inputs) {
			var input = inputs[key];
			if (input.disabled) return;
			
			var target = event.target || event.srcElement;
			var tagName = target.tagName;
			var not = !(
				tagName == selectTag ||
				tagName == inputTag && target.type == 'text');
			if (not || altKey) {
				input.focus();
				if (altKey) {
					if (not) {
						input.click();
					}
					return false;
				}
			}
		}
	}
	function onkeyup(event) {
		alt((event || window.event).altKey);
	}
	
	function d(id, disabled) {
		var input = inputs[id];
		input.disabled = disabled;
		input.parentNode.className = disabled ? 'disabled' : '';
	}
	function onchange() {
		d('d', config.s);
		d('f', config.s);
		d('t', config.s);
		d('m', config.s || config.t);
		d('y', config.s);
		d('a', config.s || config.y);
		
		d('k1', !config.k);
		d('k2', !config.k);
		
		d('i', config.v);
		d('n', config.v);
		d('p', config.v || config.i == 10 && config.n != 4);
		d('j', config.v || config.i >= 3600);
		d('z', config.v || config.i >=   60);
		d('x', config.v);
		d('g', config.v || config.l);
		d('r', config.l);
		d('c', config.v);
		d('w', config.v);
	}
	
	function oncheck() {
		config[this.id] = this.checked;
		onchange();
		
		changed = this.id == 'l' || this.id == 'r';
	}
	function onselect() {
		config[this.id] = +this.value;
		onchange();
	}
	
	function activate() {
		if (!this.checked) {
			try {
				switch (this.id) {
					case 's':
					if (!context) {
						context = new AudioContext();
						destination = context.destination;
					}
					context.resume();
					break;
					
					case 'v':
					speak('');
					break;
				}
			} catch (e) {
				window.alert(e);
				this.checked = true;
			}
		}
		oncheck.call(this);
	}
	
	function input(id) {
		var input = $.getElementById(id);
		if (input) {
			switch (input.tagName) {
				case inputTag:
				switch (input.type) {
					case 'checkbox':
					input.checked = config[id];
					input.onchange = id == 's' || id == 'v' ?
						activate : oncheck;
					break;
				}
				break;
				
				case selectTag:
				input.value = config[id];
				input.onchange = onselect;
				break;
			}
			inputs[id] = input;
		}
	}
	
	var rs = /\s/, rb = /\\\\/g, rq = /\\"/g, re = /\\(?=\s|")/g;
	function parse(str) {
		var args = []; var i = 0;
		for (var c; c = str.charAt(i); i++) {
			if (rs.test(c)) continue;
			var v = ''; var b = i;
			do {
				if (c == '\\') { i++; continue; }
				if (rs.test(c)) break;
				if (c != '"') continue;
				v += str.substring(b, i).replace(re, '');
				b = ++i;
				for (var d; d = str.charAt(i); i++) {
					if (d == '\\') { i++; continue; }
					if (d == c) break;
				}
				v += str.substring(b, i).replace(rq, c);
				b = i + 1;
			} while (c = str.charAt(++i));
			v += str.substring(b, i).replace(re, '');
			args.push(v.replace(rb, '\\'));
		}
		return args;
	}
	
	var escb = /\\/g, escq = /"/g;
	function quote(str) {
		return '"' + str
			.replace(escb, '\\\\')
			.replace(escq, '\\"') + '"';
	}
	
	function sets(ids, arg) {
		var l = ids.length;
		for (var i = 0; i < l; i++) {
			if (arg.charAt(i) == c1) {
				config[ids[i]] = true;
			}
		}
	}
	function set(id, arg) {
		var i = parseInt(arg, 10);
		config[id] = isNaN(i) ? 0 : i;
	}
	
	function intOf(str, defaultValue) {
		var value = parseInt(str, 10);
		return isNaN(value) ? defaultValue : value;
	}
	
	function custom(arg) {
		var index = arg.indexOf('=');
		var key   = arg.substring(0, index);
		var value = arg.substr(index + 1);
		switch (key) {
			case 'voice':
			voiceURI = value;
			break;
			
			case 'pitch': case 'rate':
			var f = parseFloat(value);
			if (isNaN(f)) break;
			params[key] = f;
			break;
		}
	}
	
	function load() {
		var hash = location.hash;
		if (hash) {
			var argv = parse(decode(hash.substr(1)));
			var argc = argv.length;
			for (var i = 0; i < argc; i++) {
				var arg = argv[i];
				if (arg.charAt(0) != '-') continue;
				var c = arg.charAt(1);
				var v = arg.substr(2);
				switch (c) {
					case 'x': sets(xids, v); break;
					case 'w': sets(wids, v); break;
					
					case 'f': case 'a': case 'n': case 'p':
					set(c, v);
					break;
					
					case 's': set('d', v); break;
					case 'v': set('i', v); break;
					
					case 'q':
					var vs = v.split('-');
					config.k1 = intOf(vs[0], 0);
					config.k2 = intOf(vs[1], config.k1);
					config.k = true;
					break;
					
					case '-': custom(v); break;
				}
			}
		} else {
			config.f = 2;
			config.m = true;
			config.n = 1;
			config.z = true;
		}
	}
	
	function gets(ids, flag) {
		var flags = '';
		var l = ids.length;
		for (var i = 0; i < l; i++) {
			if (config[ids[i]]) {
				flag = true;
				flags += c1;
			} else {
				flags += c0;
			}
		}
		return flag ? flags : null;
	}
	function save() {
		var hash = '-x' + gets(xids, true);
		var w = gets(wids, false);
		if (w) {
			hash += ' -w' + w;
		}
		
		hash += ' -f' + config.f;
		if (config.a != 3) {
			hash += ' -a' + config.a;
		}
		
		hash += ' -n' + config.n;
		hash += ' -p' + config.p;
		
		hash += ' -s' + config.d;
		hash += ' -v' + config.i;
		
		if (config.k) {
			hash += ' -q' + config.k1 + '-' + config.k2;
		}
		
		if (params.pitch != 1) {
			hash += ' --pitch=' + params.pitch;
		}
		if (params.rate != 1) {
			hash += ' --rate=' + params.rate;
		}
		if (voice) {
			hash += ' --voice=' + quote(voice.voiceURI);
		}
		
		location.hash = hash;
	}
	
	function help() {
		window.open('https://github.com/yuru4c/117/blob/master/README.md');
	}
	
	// 時刻補正 JSONP (http://www.nict.go.jp/JST/http.html)
	
	var diff = 0; // クライアント時刻 - サーバ時刻 (ミリ秒)
	
	var leap, step; var stepped = false;
	
	var ids = [
		'ntp-a1.nict.go.jp',
		'ntp-b1.nict.go.jp',
		'ntp-a4.nict.go.jp'
	];
	var servers = []; // サーバリスト
	
	var head; // head要素 appendChild(script)用
	
	var running, first; // 実行中, 最初の受信フラグ
	var maxL, minU; // 時差 下限の最大値, 上限の最小値 (ミリ秒)
	var i, length = ids.length;
	
	var lastIt;    // 最後(待機中)の発信時刻 (秒)
	var script;    // JSONP script要素
	var timeoutId; // タイムアウト Timeout ID
	
	// 補正された現在時刻を取得
	function getNow() {
		var now = new Date() - diff;
		if (step) {
			if (!stepped && now >= (step < 0 ? leap + step : leap)) {
				diff += step;
				now  -= step;
				result();
				stepped = true;
			}
			if (stepped && now >= leap) {
				step = 0;
				stepped = false;
			}
		}
		return now;
	}
	
	function half(n) { // n/2を0側へ丸める
		return (n - n % 2) / 2;
	}
	
	// コールバック関数
	function jsonp(json) {
		var receivedDate = new Date(); // 受信時刻 直ちに取得
		var it           = json.it; // Initiated Time (秒)
		
		if (it != lastIt) return; // 待機中の応答でなければ無視
		
		window.clearTimeout(timeoutId); // タイムアウト解除
		
		var serverTime = json.st * 1000; // (ミリ秒)
		
		var l = it * 1000    - serverTime; // 時差 下限 (ミリ秒)
		var u = receivedDate - serverTime; // 時差 上限 (ミリ秒)
		
		// 誤差軽減
		if (first) { // 最初の受信
			first = false;
			maxL = l;
			minU = u;
		} else {
			if (l > maxL) maxL = l;
			if (u < minU) minU = u;
		}
		diff = half(maxL + minU);
		
		leap = json.next * 1000;
		step = leap < serverTime ? 0 : json.step * 1000;
		stepped = false;
		
		// ログ書き換え
		log(i, rstr(half(l + u), u - l) + ' ⇒ ' +
			rstr(diff, minU - maxL) + ' ms');
		
		next();
	}
	
	function send() { // JSONPリクエスト
		script = $.createElement('script');
		script.type = 'text/javascript';
		var server = servers[i];
		lastIt = new Date() / 1000; // 発信時刻 (秒)
		script.src = server + lastIt;
		head.appendChild(script); // 直ちに送信
	}
	
	function timeout() { // タイムアウト
		lastIt = null;
		head.removeChild(script);
		log(i, '× タイムアウト');
		next();
	}
	
	function next() { // 次のサーバへ
		i++;
		fetch();
	}
	
	function fetch() { // サーバ時刻を取得
		if (i < length) {
			log(i, '取得中...');
			
			window.setTimeout(send, 0); // リクエスト
			timeoutId = window.setTimeout(timeout, period);
		} else { // 完了
			// 表示更新
			if (!first) {
				result();
				date.setTime(getNow());
				lastText.data = date.toLocaleString();
			}
			refetch.disabled = false;
			
			running = false;
		}
	}
	
	// サーバ時刻取得開始
	function start() {
		if (running) return; // 同時実行不可
		running = true;
		
		// 表示更新
		refetch.disabled = true;
		for (var j = 1; j < length; j++) {
			log(j, '保留');
		}
		
		jsont = jsonp; // コールバック関数を公開
		first = true;  // 最初
		
		i = 0;
		fetch();
	}
	
	// 表示
	
	var h12;
	var titleText, hrs, mins, secs, ms; // TextNodes
	
	var pm, ps; // 前の値 (上位含む)
	var pstep, changed;
	
	var refreshId;
	
	function write(textNode, value, unit, add) { // 書き換え
		var num = value % unit; // 表示する値
		if (add) {
			num += unit;
		}
		// ゼロ埋め
		var padding = '';
		for (var d = 10; d < unit; d *= 10) {
			if (num < d) padding += '0';
		}
		textNode.data = padding + num; // 書き換え
		
		return (value - num) / unit; // 上位の値を返却
	}
	
	// 表示を更新
	function refresh() {
		var now = getNow(); // 現在時刻
		if (stepped) {
			now += step;
		}
		
		// 変化する単位まで更新
		var rem = write(ms, now, 1000);
		if (rem == ps && !changed && stepped == pstep) return;
		
		rem = write(secs, ps = rem, 60, pstep = stepped);
		if (rem == pm && !changed) return;
		
		pm = rem;
		changed = false;
		
		date.setTime(now);
		write(mins, date.getMinutes(), 60);
		
		var h = date.getHours();
		hrs.data = config.l || config.r && h == 12 ||
			h < 12 ? h : h - 12;
		h12.className = config.l ? 'h24' : h < 12 ? 'am' : 'pm';
		
		titleText.data =
			date.getFullYear()    + '年' +
			(date.getMonth() + 1) + '月' +
			date.getDate()        + '日 ' +
			days[date.getDay()]   + '曜日';
	}
	
	function onvisibilitychange() {
		if (this[hidden]) {
			if (refreshId != null) {
				window.clearInterval(refreshId);
				refreshId = null;
			}
		} else {
			if (refreshId == null) {
				refreshId = window.setInterval(refresh, interval);
			}
		}
	}
	
	// 発振音
	
	var gain = 0.5;
	
	function Tone(frequency, duration, ramp) {
		this.frequency = frequency;
		this.duration = duration;
		this.ramp = ramp == null ?
			duration - 1 / frequency : ramp;
	}
	var tones = [
		[
			new Tone( 440, 0.1),
			new Tone( 880, 3.0, 1.0),
			new Tone( 880, 0.1)
		], [
			new Tone( 400, 0.25, 0.125),
			new Tone( 800, 1.3,  0.65),
			new Tone(1600, 0.1,  0.05)
		], [
			new Tone( 500, 0.2),
			new Tone(1000, 1.8, 0),
			new Tone(2000, 0.02)
		]
	];
	
	function play(time, tone) {
		var end = time + tone.duration;
		var node = context.createGain();
		var param = node.gain;
		var oscillator = context.createOscillator();
		
		param.value = gain;
		param.setValueAtTime(gain, time + tone.ramp);
		param.linearRampToValueAtTime(0, end);
		node.connect(destination);
		
		oscillator.frequency.value = tone.frequency;
		oscillator.start(time);
		oscillator.stop(end);
		oscillator.connect(node);
	}
	
	function signal(secs) {
		if (config.s || config.x && speechSynthesis.speaking) return;
		
		var tone = tones[config.f];
		var quiet = true;
		var time = context.currentTime;
		
		if (secs % config.d) {
			if (!config.y) {
				var d30 = 30 - secs % 30;
				if (!(d30 > config.a || (secs + d30) % config.d)) {
					play(time, tone[0]);
					quiet = false;
				}
			}
		} else {
			play(time, tone[1]);
			quiet = false;
		}
		if (!config.t && (quiet || config.m)) {
			play(time, tone[2]);
		}
	}
	
	// アナウンス
	
	var comma = '、';
	
	function speak(text) {
		var utterance = new Utterance(text);
		utterance.lang = lang;
		utterance.voice = voice;
		utterance.pitch = params.pitch;
		utterance.rate  = params.rate;
		speechSynthesis.speak(utterance);
	}
	
	function about(diff) {
		date.setSeconds(date.getSeconds() + diff);
		var str = '';
		var h = date.getHours();
		var m = date.getMinutes();
		var s = date.getSeconds();
		var noon = h == 12, just = !(m || s);
		
		if (just) {
			if (config.c) {
				str += date.getMonth() + 1 + '月' + comma +
				       date.getDate()      + '日' + comma;
			}
			if (config.w) {
				str += days[date.getDay()] + '曜日' + comma;
			}
			if (noon) {
				return str + '正午';
			}
		}
		
		if (!(config.l || config.g)) {
			str += (h < 12 ? '午前' : '午後') + comma;
		}
		str += (config.l || config.r && noon ||
			h < 12 ? h : h - 12) + '時';
		
		if (config.i < 3600) {
			if (!just) {
				if (!config.z || m) {
					str += comma + m + '分';
				}
				if (config.i < 60) {
					if (s) {
						str += comma + s + '秒';
					} else {
						just = true;
					}
				}
			}
			if (just && !config.j) {
				str += comma + '丁度';
			}
		}
		return str;
	}
	
	function announce(secs) {
		if (config.v || speechSynthesis.speaking) return;
		var p = -secs % config.i, n = config.i + p;
		
		if (n == 9) {
			switch (config.n) {
				case 0:
				speak(about(n) + 'を' + comma + 'お伝えします');
				return;
				case 1:
				speak(about(n) + 'を' + comma + 'お知らせします');
				return;
				case 2:
				speak('まもなく' + comma + about(n) + 'です');
				return;
				case 3:
				speak(about(n) + 'になります');
				return;
			}
		}
		if (p == -1) {
			switch (config.p) {
				case 1:
				speak(about(p) + 'を' + comma + 'お伝えしました');
				return;
				case 2:
				speak(about(p) + 'を' + comma + 'お知らせしました');
				return;
				case 3:
				speak(about(p) + 'です');
				return;
				case 4:
				speak(about(p) + 'になりました');
				return;
			}
		}
	}
	
	// 再生
	
	var ticked;
	
	function test() {
		date.setTime(ticked);
		if (config[wids[date.getDay()]]) {
			return false;
		}
		if (config.k) {
			var now = 60 * date.getHours() + date.getMinutes();
			var k1  = 60 * config.k1 +  1; var l = now <  k1;
			var k2  = 60 * config.k2 + 59; var r = now >= k2;
			return k1 > k2 ? l && r : l || r;
		}
		return true;
	}
	
	function tack() {
		var now = getNow(), timeout = 1000 - now % 1000;
		window.setTimeout(tick, timeout);
		
		ticked = now + timeout;
		if (!step || stepped) return;
		if (ticked > (step < 0 ? leap : leap + step) - 9000) {
			ticked -= step;
		}
	}
	
	function tick() {
		if (test()) {
			var secs = (ticked + lag) / 1000;
			signal(secs);
			announce(secs);
		}
		tack();
	}
	
	// 初期化
	
	var lis = []; // 時刻補正ログ li要素
	
	for (i = 0; i < length; i++) {
		var id = ids[i];
		servers[i] = '//' + id + '/cgi-bin/jsont?';
		
		var li = $.createElement('li');
		li.appendChild($.createTextNode(id + ': '));
		var logText = $.createTextNode('―'); // 書き換え用TextNode
		li.appendChild(logText);
		
		lis[i] = li;
		logTexts[i] = logText;
	}
	
	function init() {
		start(); // サーバ時刻取得開始
		tack();
		
		onvisibilitychange.call($); // 表示更新開始
		$.addEventListener(visibilitychange, onvisibilitychange);
	}
	
	$.onreadystatechange = function () {
		this.onreadystatechange = null;
		
		load();
		
		// head 要素取得
		head = $.getElementsByTagName('head')[0];
		
		// メイン画面
		
		var main = $.getElementById('main');
		
		titleText = $.getElementById('title').firstChild;
		
		h12 = $.getElementById('h12');
		
		// 時間表示 TextNode取得
		var tts = main.getElementsByTagName('tt');
		hrs  = tts[0].firstChild;
		mins = tts[1].firstChild;
		secs = tts[2].firstChild;
		ms   = tts[3].firstChild;
		
		// 設定画面
		
		pref = $.getElementById('pref');
		
		// 時刻補正
		refetch = $.getElementById('refetch');
		refetch.onclick = start;
		
		diffText = $.getElementById('diff').firstChild;
		lastText = $.getElementById('last').childNodes[2];
		
		// 時刻補正ログ
		var log = $.getElementById('log');
		for (i = 0; i < length; i++) {
			log.appendChild(lis[i]);
		}
		log.removeChild(log.firstChild);
		
		// 設定取得
		
		select = $.getElementById('voice');
		select.onchange = onchangeVoice;
		
		if (speechSynthesis) {
			speechSynthesis.onvoiceschanged = onvoiceschanged;
			speechSynthesis.onvoiceschanged();
		}
		
		var id;
		for (id in params) {
			bind(id);
		}
		
		for (id in config) {
			input(id);
		}
		onchange();
		
		$.getElementById('help').onclick = help;
		$.getElementById('save').onclick = save;
		
		$.onkeydown = onkeydown;
		$.onkeyup   = onkeyup;
		
		
		if (this.readyState == 'complete') {
			init();
		} else {
			window.onload = init;
		}
	};
})(window, document);
