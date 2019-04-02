
var jsont; // JSONPコールバック関数公開用

(function (window, $) {
	
	var String = this.String;
	var Date   = this.Date;
	
	var Math = this.Math;
	
	var isNaN = this.isNaN;
	var parseInt   = this.parseInt;
	var parseFloat = this.parseFloat;
	
	var decode = this.decodeURIComponent;
	
	// ベンダー プレフィックス
	var webkit = 'webkit', moz = 'moz';
	function prefix(object, key, vendors) {
		if (key in object) {
			return key;
		}
		var uc = key.charAt(0).toUpperCase() + key.substr(1);
		for (var i = 0; i < vendors.length; i++) {
			var prefixed = vendors[i] + uc;
			if (prefixed in object) {
				return prefixed;
			}
		}
		return key;
	}
	
	var AudioContext = this[prefix(this, 'AudioContext', [webkit])];
	var Utterance = this.SpeechSynthesisUtterance;
	
	// 内部設定
	
	// 表示更新間隔
	var interval = Math.ceil(1000 / 24);
	while (!(interval % 2 && interval % 5)) { interval++; }
	
	// 時刻取得タイムアウト
	var period = 3000;
	
	// サーバリスト
	var ids = [
		'ntp-a1.nict.go.jp',
		'ntp-b1.nict.go.jp',
		'ntp-a4.nict.go.jp'
	];
	var path = '/cgi-bin/jsont?';
	
	// 発振音の音量
	var gain = Math.SQRT1_2 / 2;
	
	// ヘルプのアドレス
	var readme = 'https://github.com/yuru4c/117/blob/master/README.md';
	
	// 共用変数
	
	var date = new Date(70, 0);
	var epoch = +date;
	var days = ['日', '月', '火', '水', '木', '金', '土'];
	
	var location = window.location;
	
	var hidden = prefix($, 'hidden', [webkit, moz]);
	var visibilitychange = hidden.slice(0, -6) + 'visibilitychange';
	
	var context;
	var direct, destination;
	var latency;
	
	var lang = 'ja-JP';
	var langRe = /^ja/i;
	var synthesis = window.speechSynthesis;
	
	// 設定画面
	
	var pref; // #pref要素
	var prefClass, altClass;
	
	var refetch;  // #refetch要素 再取得ボタン
	var diffText, leapText, lastText; // 補正, 閏秒, 最終更新 TextNode
	var lis = [];      // 時刻補正ログ li要素[]
	var logTexts = []; // 時刻補正ログ TextNode[]
	
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
	
	function toggle() {
		this.parentNode.className = this.checked ? '' : 'hide';
	}
	
	function focused() {
		$.activeElement.select();
	}
	function onfocus() {
		window.setTimeout(focused);
	}
	
	// 設定
	
	var config = {
		s: true, d: 10, f: 2,
		t: false, m: true,
		y: false, a: 3,
		
		k: false, k1: 21, k2: 6,
		h0: false, h1: false, h2: false, h3: false,
		h4: false, h5: false, h6: false,
		
		v: true, i: 10, n: 1, p: 0,
		j: false, z: true,
		x: false,
		l: false, g: false, r: false,
		c: false, w: false,
		
		_: false,
		
		ntp: true,
		before: 9, after: 1,
		next: '',
		prev: '',
		
		jjy: false
	};
	var inputs = {};
	var button;
	
	var timecode;
	var t0, t1;
	var timecodes = [];
	var bar;
	
	var inputTag = 'INPUT', selectTag = 'SELECT';
	var dClass = 'disabled';
	
	var xids = [
		's', 'v', 't', 'm', 'y',
		'j', 'l', 'x', 'c', '_', 'w', 'z', 'g', 'r'
	];
	var wids = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
	
	function prev() {
		return config.i != 10 || config.n == 4;
	}
	
	function d(input, disabled) {
		input.disabled = disabled;
		input.parentNode.className = disabled ? dClass : '';
	}
	function disable() {
		d(inputs.d, config.s);
		d(inputs.f, config.s);
		d(inputs.t, config.s);
		d(inputs.m, config.s || config.t);
		d(inputs.y, config.s);
		d(inputs.a, config.s || config.y);
		
		d(inputs.k1, !config.k);
		d(inputs.k2, !config.k);
		
		d(inputs.i, config.v);
		d(inputs.n, config.v);
		d(inputs.p, config.v || !prev());
		d(inputs.j, config.v || config.i >= 3600);
		d(inputs.z, config.v || config.i >=   60);
		d(inputs.x, config.v);
		d(inputs.g, config.v || config.l);
		d(inputs.r, config.l);
		d(inputs.c, config.v);
		d(inputs.w, config.v);
		
		d(inputs.before, config.v);
		d(inputs.after,  config.v);
		d(inputs.next, config.n != -1);
		d(inputs.prev, config.p != -1);
		
		for (var i = 0; i < freqs.length; i++) {
			d(freqs[i], !config.jjy);
		}
	}
	
	function dirty() {
		button.disabled = false;
	}
	
	function resume() {
		if (!context) {
			context = new AudioContext();
			direct = context.destination;
			destination = context.createGain();
			destination.gain.value = gain;
			destination.connect(direct);
			
			latency = context.baseLatency;
			if (latency == null) {
				latency = 0;
			}
		}
		if (context.resume != null) {
			context.resume();
		}
	}
	function speak() {
		synthesis.speak(new Utterance(' '));
	}
	
	function reset() {
		for (var i = 0; i < cl; i++) {
			timecodes[i].className = '';
		}
		var half = bar.parentNode;
		if (half) {
			half.removeChild(bar);
			pbefore = null;
		}
	}
	
	function oncheck() {
		switch (this.id) {
			case 's':
			if (!this.checked) {
				resume();
			}
			break;
			case 'v':
			if (!this.checked) {
				speak();
			}
			break;
			
			case 'l': case 'r':
			changed = true;
			break;
			
			case 'jjy':
			if (this.checked) {
				resume();
				changing = true;
			} else {
				reset();
			}
			break;
		}
		config[this.id] = this.checked;
		disable();
		
		switch (this.id) {
			case 'jjy': break;
			default: dirty(); break;
		}
	}
	function onselect() {
		config[this.id] = +this.value;
		disable();
		dirty();
	}
	function oninput() {
		config[this.id] = this.value;
		dirty();
	}
	
	function register(id) {
		var input = $.getElementById(id);
		if (input == null) return;
		
		switch (input.tagName) {
			case inputTag:
			switch (input.type) {
				case 'checkbox':
				input.checked = config[id];
				input.onclick = oncheck;
				break;
				
				default:
				input.value = config[id];
				input.onfocus = onfocus;
				input.oninput  = oninput;
				input.onchange = oninput;
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
	
	function alt(altKey) {
		pref.className = altKey ? altClass : prefClass;
	}
	
	function onkeydown(event) {
		var altKey = event.altKey;
		alt(altKey);
		
		var key = String.fromCharCode(event.keyCode | 32);
		if (key in inputs) {
			var input = inputs[key];
			if (input.disabled) return;
			
			var target = event.target;
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
		alt(event.altKey);
	}
	
	// 詳細設定
	
	var select;
	var voiceURI;
	var voices = [];
	var voice;
	
	var params = {pitch: null, rate: null, volume: null};
	var binds = {};
	
	var freqs;
	var frequency;
	
	function setVoice(changed) {
		voice = voices[select.selectedIndex];
		if (changed) {
			dirty();
		}
	}
	
	function onvoiceschanged() {
		var vs = this.getVoices();
		var restore = false;
		var selection = 0, i;
		
		voices.length = 0;
		for (i = select.length - 1; i >= 0; i--) {
			select.remove(i);
		}
		for (i = 0; i < vs.length; i++) {
			var v = vs[i];
			var lang = v.lang;
			if (lang && !langRe.test(lang)) continue;
			
			var l = voices.push(v);
			var uri = v.voiceURI;
			var def = v['default'];
			
			var option = $.createElement('option');
			option.appendChild($.createTextNode(
				def ? v.name + ' （既定値）' : v.name));
			select.add(option);
			
			if (voiceURI != null && uri == voiceURI) {
				restore = true;
				selection = l;
				voiceURI = null;
			}
			if (restore) continue;
			restore = voice != null && uri == voice.voiceURI;
			if (restore || !selection && def) {
				selection = l;
			}
		}
		if (selection) {
			select.selectedIndex = selection - 1;
		}
		setVoice(!restore);
	}
	
	function onchange() {
		voiceURI = null;
		setVoice(true);
	}
	
	function count(str) {
		if (str) {
			var point = str.indexOf('.');
			if (point != -1) {
				return str.length - point - 1;
			}
		}
		return 0;
	}
	function toFixed(num, digits) {
		var str = num.toString();
		return count(str) < digits ? num.toFixed(digits) : str;
	}
	
	function handler(event) {
		var param = binds[this.id]
			.handle(event.target, event.type == 'change');
		if (param != null) {
			params[this.id] = param;
			dirty();
		}
	}
	
	function Bind(id, disabled) {
		var param = params[id];
		
		var box = $.getElementById(id);
		var inputs = box.getElementsByTagName('input');
		this.input = inputs[0];
		this.range = inputs[1];
		
		this.value = +this.range.defaultValue;
		this.digits = count(this.range.step);
		
		if (param == null) {
			params[id] = param = this.value;
		}
		this.input.value = toFixed(param, this.digits);
		this.range.value = param;
		
		if (disabled) {
			this.input.disabled = true;
			this.range.disabled = true;
			box.parentNode.className = dClass;
			return;
		}
		this.min = +this.range.min;
		this.max = +this.range.max;
		
		this.input.placeholder = this.value.toFixed(this.digits);
		this.input.onfocus = onfocus;
		
		box.oninput  = handler;
		box.onchange = handler;
	}
	
	Bind.prototype.handle = function (target, done) {
		var value = parseFloat(target.value);
		switch (target.type) {
			case 'range':
			this.input.value = value.toFixed(this.digits);
			return done ? value : null;
			
			default:
			if (isNaN(value)) {
				value = this.value;
			} else {
				if (value < this.min) { value = this.min; }
				if (value > this.max) { value = this.max; }
			}
			if (done) {
				this.input.value = toFixed(value, this.digits);
			}
			this.range.value = value;
			return value;
		}
	};
	
	function onfreqchange() {
		for (var i = 0; i < freqs.length; i++) {
			var freq = freqs[i];
			if (freq.checked) {
				frequency = freq.value / 3;
				return;
			}
		}
	}
	
	// 読み込み・保存
	
	var rs = /\s/, rb = /\\\\/g, rq = /\\"/g, re = /\\(?=\s|")/g;
	var escb = /\\|"/g, escp = /%/g;
	
	var c0 = '0', c1 = '1';
	var sh = ' --', se = '=', ss = '-';
	
	function sets(ids, str) {
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			switch (id) {
				case 's':
				case 'v': continue;
			}
			config[id] = str.charAt(i) == c1;
		}
	}
	function intOf(str, defaultValue) {
		var value = parseInt(str, 10);
		return isNaN(value) ? defaultValue : value;
	}
	
	function custom(arg) {
		var index = arg.indexOf(se);
		if (index == -1) {
			index = arg.length;
		}
		var key   = arg.substring(0, index);
		var value = arg.substr(index + 1);
		
		switch (key) {
			case 'off':
			config.ntp = false;
			break;
			
			case 'voice':
			voiceURI = value;
			break;
			
			case 'volume': case 'pitch': case 'rate':
			var f = parseFloat(value);
			if (isNaN(f)) break;
			params[key] = f;
			break;
			
			case 'timing':
			var ts = value.split(ss);
			config.before = intOf(ts[0], config.before);
			config.after  = intOf(ts[1], config.after);
			break;
			
			case 'next': case 'prev':
			config[key] = value;
			break;
		}
	}
	
	function set(arg) {
		if (arg.charAt(0) != '-') return;
		var c = arg.charAt(1);
		var v = arg.substr(2);
		
		switch (c) {
			case 'x': sets(xids, v); break;
			case 'w': sets(wids, v); break;
			
			case 'f': case 'n': case 'p':
			config[c] = intOf(v, 0);
			break;
			case 'a': config.a = intOf(v, 3); break;
			
			case 's': config.d = intOf(v, 10); break;
			case 'v': config.i = intOf(v, 10); break;
			
			case 'q':
			var ks = v.split(ss);
			config.k = true;
			config.k1 = intOf(ks[0], 0);
			config.k2 = intOf(ks[1], config.k1);
			break;
			
			case '-': custom(v); break;
		}
	}
	
	function load() {
		var hash = location.hash;
		if (!hash) return;
		var str = decode(hash.substr(1));
		
		var i = 0;
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
			
			set(v.replace(rb, '\\'));
		}
	}
	
	function gets(ids, flag) {
		var flags = '';
		for (var i = 0; i < ids.length; i++) {
			if (config[ids[i]]) {
				flag = true;
				flags += c1;
			} else {
				flags += c0;
			}
		}
		return flag ? flags : null;
	}
	function quote(str) {
		return '"' + str
			.replace(escb, '\\$&')
			.replace(escp, '%25') + '"';
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
			hash += ' -q' + config.k1 + ss + config.k2;
		}
		
		if (!config.ntp) {
			hash += sh + 'off';
		}
		if (!config.v && (config.before != 9 || config.after != 1)) {
			hash += sh + 'timing' + se + config.before + ss + config.after;
		}
		
		if (params.volume != 1) {
			hash += sh + 'volume' + se + params.volume;
		}
		if (params.pitch != 1) {
			hash += sh + 'pitch' + se + params.pitch;
		}
		if (params.rate != 1) {
			hash += sh + 'rate' + se + params.rate;
		}
		if (voice != null) {
			hash += sh + 'voice' + se + quote(voice.voiceURI);
		}
		
		if (config.n == -1 && config.next) {
			hash += sh + 'next' + se + quote(config.next);
		}
		if (config.p == -1 && config.prev) {
			hash += sh + 'prev' + se + quote(config.prev);
		}
		
		location.hash = hash;
		this.disabled = true;
	}
	
	function help() {
		window.open(readme);
	}
	
	// 時刻補正 JSONP (http://www.nict.go.jp/JST/http.html)
	
	var diff = 0; // クライアント時刻 - サーバ時刻 (ミリ秒)
	
	var leap, step, leaps;
	var leaping, stepped = false;
	
	var head; // head要素 appendChild(script)用
	var srcs = [];
	
	var running, first; // 実行中, 最初の受信フラグ
	var maxL, minU; // 時差 下限の最大値, 上限の最小値 (ミリ秒)
	var i, length = ids.length;
	
	var lastIt;    // 最後(待機中)の発信時刻 (秒)
	var script;    // JSONP script要素
	var timeoutId; // タイムアウト Timeout ID
	
	// 補正された現在時刻を取得
	function getNow() {
		var now = new Date() - diff;
		if (leaping) {
			if (!stepped && now >= leaps) {
				diff += step;
				now  -= step;
				result();
				stepped = true;
			}
			if (stepped && now >= leap) {
				leaping = false;
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
			if (l > maxL) { maxL = l; }
			if (u < minU) { minU = u; }
		}
		diff = half(maxL + minU);
		
		leap = json.next * 1000;
		step = json.step * 1000;
		
		leaping = leap > serverTime;
		stepped = false;
		if (leaping) {
			leaps = step < 0 ? leap + step : leap;
		}
		
		result();
		log(i, rstr(half(l + u), u - l) + ' ⇒ ' +
			rstr(diff, minU - maxL) + ' ms');
		
		next();
	}
	
	function send() { // JSONPリクエスト
		script = $.createElement('script');
		script.type = 'text/javascript';
		var src = srcs[i];
		lastIt = new Date() / 1000; // 発信時刻 (秒)
		script.src = src + lastIt;
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
			
			window.setTimeout(send); // リクエスト
			timeoutId = window.setTimeout(timeout, period);
		} else { // 完了
			// 表示更新
			if (!first) {
				date.setTime(getNow());
				lastText.data = date.toLocaleString();
				
				date.setTime(leap);
				leapText.data = (step > 0 ? '+' : '') +
					step / 1000 + ' @ ' + date.toLocaleString();
				
				pc = null;
			}
			
			refetch.disabled = false;
			refetch.value = '再取得';
			
			running = false;
		}
	}
	
	// サーバ時刻取得開始
	function start() {
		if (running) return; // 同時実行不可
		running = true;
		
		// 表示更新
		refetch.disabled = true;
		refetch.value = '取得中';
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
	var activeAttr = 'data-active';
	
	var pm, ps; // 前の値 (上位含む)
	var pbefore, pstep, changed;
	var pactive;
	
	var refreshId;
	
	function write(textNode, value, unit, add) { // 書き換え
		var num = value % unit; // 表示する値
		if (add) {
			num += unit;
		}
		// ゼロ埋め
		var padding = '';
		for (var d = 10; d < unit; d *= 10) {
			if (num < d) { padding += '0'; }
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
		
		if (config.jjy) {
			var pos = now % 60000 / 1000;
			if (stepped) pos += 60;
			
			var before = pos < 30;
			if (before != pbefore) {
				(before ? t0 : t1).appendChild(bar);
				pbefore = before;
			}
			var left = before ? pos : pos - 30;
			bar.style.left = (left < 30 ? left : 30) + 'em';
			
			var active;
			var p = ~~pos;
			if (p < cl && pos - p < pulse[code[p]]) {
				active = timecodes[p];
			}
			if (active != pactive) {
				if (pactive) {
					pactive.removeAttribute(activeAttr);
				}
				if (active) {
					active.setAttribute(activeAttr, activeAttr);
				}
				pactive = active;
			}
		}
		
		// 変化する単位まで更新
		var rem = write(ms, now, 1000);
		if (rem == ps && !changed && stepped == pstep) return;
		
		rem = write(secs, ps = rem, 60, pstep = stepped);
		if (rem == pm && !changed) return;
		
		pm = rem;
		changed = false;
		changing = false;
		
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
		
		if (config.jjy) {
			for (var i = 0; i < cl; i++) {
				timecodes[i].className = 'code-' + code[i];
			}
		}
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
	
	var speaking;
	
	function Note(frequency, duration, delay) {
		this.frequency = frequency;
		this.duration = duration;
		this.delay = delay;
	}
	
	Note.prototype.on = function (time) {
		var end = time + this.duration;
		var oscillator = context.createOscillator();
		
		oscillator.frequency.value = this.frequency;
		oscillator.start(time);
		oscillator.stop(end);
		
		if (this.delay == null) {
			oscillator.connect(destination);
		} else {
			var node = context.createGain();
			var gain = node.gain;
			gain.setValueAtTime(1, time + this.delay);
			gain.linearRampToValueAtTime(0, end);
			
			oscillator.connect(node);
			node.connect(destination);
		}
	};
	
	var notes = [
		[
			new Note( 440, 0.1),
			new Note( 880, 3.0, 1.0),
			new Note( 880, 0.1)
		], [
			new Note( 400, 0.25, 0.125),
			new Note( 800, 1.3,  0.65),
			new Note(1600, 0.1,  0.05)
		], [
			new Note( 500, 0.2),
			new Note(1000, 1.8, 0),
			new Note(2000, 0.02)
		]
	];
	
	function signal(s, time) {
		if (config.s || speaking) return;
		var note = notes[config.f];
		var quiet = true;
		
		if (s % config.d) {
			if (!config.y) {
				var r30 = 30 - s % 30;
				if (!(r30 > config.a || (s + r30) % config.d)) {
					note[0].on(time);
					quiet = false;
				}
			}
		} else {
			note[1].on(time);
			quiet = false;
		}
		if (!config.t && (quiet || config.m)) {
			note[2].on(time);
		}
	}
	
	// アナウンス
	
	var utterance;
	
	var comma = '、';
	var replacer = /~|\u301c|\uff5e/g;
	
	function about(secs) {
		date.setSeconds(date.getSeconds() - secs);
		var str = '';
		var h = date.getHours();
		var m = date.getMinutes();
		var s = date.getSeconds();
		var noon = h == 12, just = !(m || s);
		
		if (just) {
			if (config.c) {
				str += date.getMonth() + 1 + '月' + comma;
				str += date.getDate()      + '日' + comma;
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
	function speech(p) {
		var n = p - config.i;
		if (n == -config.before) {
			switch (config.n) {
				case 0: return about(n) + 'を、お伝えします';
				case 1: return about(n) + 'を、お知らせします';
				case 2: return 'まもなく、' + about(n) + 'です';
				case 3: return about(n) + 'になります';
				case -1:
				return config.next.replace(replacer, about(n));
			}
		}
		if (p == config.after && prev()) {
			switch (config.p) {
				case 1: return about(p) + 'を、お伝えしました';
				case 2: return about(p) + 'を、お知らせしました';
				case 3: return about(p) + 'です';
				case 4: return about(p) + 'になりました';
				case -1:
				return config.prev.replace(replacer, about(p));
			}
		}
	}
	
	function onend() {
		speaking = false;
	}
	function announce(s) {
		if (utterance) {
			if (!synthesis.speaking) {
				synthesis.speak(utterance);
			}
			utterance = null;
		}
		if (config.v) return;
		
		var text = speech(s % config.i);
		if (text == null) return;
		
		utterance = new Utterance(text);
		utterance.lang   = lang;
		utterance.voice  = voice;
		utterance.pitch  = params.pitch;
		utterance.rate   = params.rate;
		utterance.volume = params.volume;
		
		speaking = config.x;
		if (speaking) {
			utterance.onend   = onend;
			utterance.onerror = onend;
		}
	}
	
	// JJY
	
	var changing;
	var pc;
	
	var pulse = [0.8, 0.5, 0.2];
	var code = [
		2, 0, 0, 0, 0, 0, 0, 0, 0, 2,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 2
	];
	var cl = code.length, clh = cl / 2;
	
	function w(value, digit, start, length) {
		var pa = 0;
		var decimal = ~~(value / digit) % 10;
		for (var i = 0; i < length; i++) {
			var bit = decimal >> (length - i - 1) & 1;
			pa ^= bit;
			code[start + i] = bit;
		}
		return pa;
	}
	
	function jjy(next, time) {
		if (changing) {
			changed = true;
			changing = false;
		}
		if (!config.jjy) return;
		
		var flag = stepped;
		if (leaping) {
			if (!flag && next >= leaps) {
				next -= step;
				flag = true;
			}
			if (flag && next >= leap) {
				flag = false;
			}
		}
		var s = next / 1000, i = s % 60, c = (s - i) / 60;
		
		if (c != pc) {
			date.setTime(next);
			var m = date.getMinutes();
			var h = date.getHours();
			var y = date.getFullYear();
			var e = date.getDay();
			
			var ls = next < leap &&
				leap <= date.setMonth(date.getMonth() + 1);
			date.setTime(epoch);
			var d = -~((next - date.setFullYear(y)) / 86400000);
			y %= 100;
			
			code[37] = w(m, 10,  1, 3) ^ w(m, 1,  5, 4);
			code[36] = w(h, 10, 12, 2) ^ w(h, 1, 15, 4);
			
			w(d, 100, 22, 2);
			w(d,  10, 25, 4);
			w(d,   1, 30, 4);
			
			w(y, 10, 41, 4);
			w(y,  1, 45, 4);
			
			w(e, 1, 50, 3);
			code[53] = ls ? 1 : 0;
			code[54] = ls && step > 0 ? 1 : 0;
			
			changing = true;
			pc = c;
		}
		if (flag) return;
		
		var oscillator = context.createOscillator();
		oscillator.type = 'square';
		oscillator.frequency.value = frequency;
		oscillator.start(time);
		oscillator.stop(time + pulse[code[i]]);
		oscillator.connect(direct);
	}
	
	// 再生
	
	function tick() {
		var now = getNow(), timeout = 1500 - ((now + 500) % 1000 || 1000);
		window.setTimeout(tick, timeout);
		var time;
		if (context) {
			time = context.currentTime + timeout / 1000 - latency;
		}
		
		var next = now + timeout;
		jjy(next, time);
		
		if (leaping && !stepped && next >= leap - 5000) {
			next -= step;
		}
		
		date.setTime(next);
		if (config[wids[date.getDay()]]) return;
		if (config.k) {
			var m  = 60 * date.getHours() + date.getMinutes();
			var k1 = 60 * config.k1 +  1;
			var k2 = 60 * config.k2 + 59;
			
			var ge1 = m >= k1, lt2 = m < k2;
			if (k1 > k2 ? ge1 || lt2 : ge1 && lt2) return;
		}
		
		var s = (next - epoch) / 1000;
		signal(s, time);
		announce(s);
	}
	
	// 初期化
	
	var https = 'https:';
	var http  = 'http:';
	var protocol = (location.protocol == https ? https : http) + '//';
	
	for (i = 0; i < length; i++) {
		var id = ids[i];
		srcs[i] = protocol + id + path;
		
		var li = $.createElement('li');
		var logText = $.createTextNode('―'); // 書き換え用TextNode
		li.appendChild($.createTextNode(id + ': '));
		li.appendChild(logText);
		
		lis[i] = li;
		logTexts[i] = logText;
	}
	
	for (var j = 0; j < cl; j++) {
		timecodes[j] = $.createElement('i');
	}
	bar = $.createElement('span');
	bar.className = 'bar';
	
	load();
	
	function init() {
		$.onreadystatechange = null;
		
		if (config.ntp) {
			start(); // サーバ時刻取得開始
		}
		tick();
		
		onvisibilitychange.call($); // 表示更新開始
		$.addEventListener(visibilitychange, onvisibilitychange);
	}
	
	$.onreadystatechange = function () {
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
		prefClass = pref.className;
		altClass = prefClass + ' alt';
		
		// 時刻補正
		refetch = $.getElementById('refetch');
		refetch.onclick = start;
		diffText = $.getElementById('diff').firstChild;
		
		leapText = $.getElementById('leap').lastChild;
		lastText = $.getElementById('last').firstChild;
		
		// 時刻補正ログ
		var log = $.getElementById('log');
		for (i = 0; i < length; i++) {
			log.appendChild(lis[i]);
		}
		log.removeChild(log.firstChild);
		
		// 設定
		var noAC = AudioContext == null;
		var noSS = synthesis    == null;
		
		var id;
		for (id in config) {
			register(id);
		}
		
		select = $.getElementById('voice');
		for (id in params) {
			binds[id] = new Bind(id, noSS);
		}
		
		freqs = $.getElementsByName('frequency');
		
		$.getElementById('help').onclick = help;
		button = $.getElementById('save');
		button.onclick = save;
		
		disable();
		if (noAC) {
			d(inputs.s,   true);
			d(inputs.jjy, true);
		} else {
			var freq = $.getElementById('frequencies');
			freq.onclick = onfreqchange;
			freq.onclick();
		}
		if (noSS) {
			d(inputs.v, true);
			d(select,   true);
		} else {
			synthesis.onvoiceschanged = onvoiceschanged;
			synthesis.onvoiceschanged();
			
			select.onchange = onchange;
		}
		
		var mores = $.getElementsByName('more');
		for (var j = 0; j < mores.length; j++) {
			var more = mores[j];
			more.onclick = toggle;
			more.onclick();
		}
		
		timecode = $.getElementById('timecode');
		var ts = timecode.getElementsByTagName('div');
		t0 = ts[0];
		t1 = ts[1];
		var k;
		for (k = 0; k < clh; k++) {
			t0.appendChild(timecodes[k]);
		}
		for (; k < cl; k++) {
			t1.appendChild(timecodes[k]);
		}
		
		$.onkeydown = onkeydown;
		$.onkeyup   = onkeyup;
		
		// 続行
		
		if (this.readyState == 'complete') {
			init();
		} else {
			this.onreadystatechange = init;
		}
	};
})(window, document);
