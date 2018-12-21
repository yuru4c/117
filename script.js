
var jsont; // JSONPコールバック関数公開用

(function (window, $) {
	
	var String = this.String;
	var Date   = this.Date;
	var isNaN = this.isNaN;
	
	var AudioContext = this.AudioContext || this.webkitAudioContext;
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
	
	var context; var destination;
	var speechSynthesis = window.speechSynthesis;
	var voices = []; var voice;
	
	// 設定画面
	
	var pref; // #pref要素
	var refetch;            // #refetch要素 再取得ボタン
	var diffText, lastText; // 補正, 最終更新 TextNode
	var logTexts = [];      // 時刻補正ログ TextNode[]
	
	var select;
	var params = {pitch: 1, rate: 1};
	
	// 文字列
	function dstr(d) { // 符号反転
		return (d < 0 ? '+' : '') + -d;
	}
	function rstr(d, r) { // 時差, RTT
		return dstr(d) + ' ± ' + (r + r % 2) / 2;
	}
	
	// 表示更新
	function log(i, str) {
		logTexts[i].data = str;
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
				var def = v['default'];
				
				var option = $.createElement('option');
				option.appendChild($.createTextNode(
					def ? v.name + ' （既定値）' : v.name));
				select.add(option);
				
				if (restore) continue;
				restore = voice && v.voiceURI == voice.voiceURI;
				if (restore || !sel && def) {
					sel = l;
				}
			}
		}
		if (sel) {
			select.selectedIndex = sel - 1;
		}
		select.onchange();
	}
	
	function onchangeVoice() {
		voice = this.value ? voices[this.selectedIndex] : null;
	}
	
	function toFixed(number) {
		return number.toFixed(1);
	}
	function bind(id) {
		var param = params[id];
		var input = $.getElementById(id);
		var range = $.getElementById(id + '-r');
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
		c: false, w: false
	};
	var inputs = {};
	
	function alt(altKey) {
		pref.className = altKey ? 'alt' : '';
	}
	
	function onkeydown(event) {
		if (!event) event = window.event;
		var altKey  = event.altKey;
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
	
	function disable(id, disabled) {
		var input = inputs[id];
		input.disabled = disabled;
		input.parentNode.className = disabled ? 'disabled' : '';
	}
	function onchange() {
		disable('d', config.s);
		disable('f', config.s);
		disable('t', config.s);
		disable('m', config.s || config.t);
		disable('y', config.s);
		disable('a', config.s || config.y);
		
		disable('k1', !config.k);
		disable('k2', !config.k);
		
		disable('i', config.v);
		disable('n', config.v);
		disable('p', config.v || config.i == 10 && config.n != 4);
		disable('j', config.v || config.i >= 3600);
		disable('z', config.v || config.i >=   60);
		disable('x', config.v);
		disable('g', config.v || config.l);
		disable('r', config.l);
		disable('c', config.v);
		disable('w', config.v);
		
		force = true;
	}
	
	function oncheck() {
		config[this.id] = this.checked;
		onchange();
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
					if (context == null) {
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
	
	function getInput(id) {
		var input = $.getElementById(id);
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
			input.value = config[id]; // TODO: 指定以上の最小値を選択
			input.onchange = onselect;
			break;
		}
		return input;
	}
	
	// 時刻補正 JSONP (http://www.nict.go.jp/JST/http.html)
	
	var diff = 0; // クライアント時刻 - サーバ時刻 (ミリ秒)
	
	var ids = [
		'ntp-a1.nict.go.jp',
		'ntp-b1.nict.go.jp',
		'ntp-a4.nict.go.jp'
	];
	var servers = []; // サーバリスト
	
	var head; // head要素 appendChild(script)用
	
	var running = false, first; // 実行中, 最初の受信フラグ
	var maxL, minU; // 時差 下限の最大値, 上限の最小値 (ミリ秒)
	var i, length = ids.length;
	
	var lastIt;    // 最後(待機中)の発信時刻 (秒)
	var script;    // JSONP script要素
	var timeoutId; // タイムアウト Timeout ID
	
	// 補正された現在時刻を取得
	function getNow() {
		return new Date() - diff;
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
		
		var serverTime   = json.st * 1000; // (ミリ秒)
		
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
				diffText.data = dstr(diff);
				date.setTime(getNow());
				lastText.data = date.toLocaleString();
			}
			refetch.disable = false;
			
			running = false;
		}
	}
	
	// サーバ時刻取得開始
	function start() {
		if (running) return; // 同時実行不可
		running = true;
		
		// 表示更新
		refetch.disable = true;
		for (var j = 0; j < length; j++) {
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
	var force = false;
	
	function write(textNode, value, unit) { // 書き換え
		var num = value % unit; // 表示する値
		
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
		var now = getNow();    // 現在時刻
		
		// 変化する単位まで更新
		var rem = write(ms, now, 1000);
		if (rem == ps && !force) return;
		
		rem = write(secs, ps = rem, 60);
		if (rem == pm && !force) return;
		
		pm = rem;
		force = false;
		
		date.setTime(now);
		write(mins, date.getMinutes(), 60);
		
		var h = date.getHours();
		hrs.data = config.l || config.r && h == 12 ||
			h < 12 ? h : h - 12;
		h12.className = config.l ? 'am pm' : h < 12 ? 'am' : 'pm';
		
		titleText.data =
			date.getFullYear()    + '年' +
			(date.getMonth() + 1) + '月' +
			date.getDate()        + '日 ' +
			days[date.getDay()]   + '曜日';
	}
	
	
	var ticked = new Date(0);
	
	// 発振音
	
	var tGain = 0.5;
	
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
		var gain = node.gain;
		var oscillator = context.createOscillator();
		
		gain.value = tGain;
		gain.setValueAtTime(tGain, time + tone.ramp);
		gain.linearRampToValueAtTime(0, end);
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
		
		if (secs % config.d == 0) {
			play(time, tone[1]);
			quiet = false;
		} else if (!config.y) {
			var d30 = 30 - secs % 30;
			if (d30 <= config.a && (secs + d30) % config.d == 0) {
				play(time, tone[0]);
				quiet = false;
			}
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
		ticked.setSeconds(ticked.getSeconds() + diff);
		var str = '';
		var h = ticked.getHours();
		var m = ticked.getMinutes();
		var s = ticked.getSeconds();
		var noon = h == 12, just = !(m || s);
		
		if (just) {
			if (config.c) {
				str += ticked.getMonth() + 1 + '月' + comma +
				       ticked.getDate()      + '日' + comma;
			}
			if (config.w) {
				str += days[ticked.getDay()] + '曜日' + comma;
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
	
	function test() {
		if (config['h' + ticked.getDay()]) {
			return false;
		}
		if (config.k) {
			var now = 60 * ticked.getHours() + ticked.getMinutes();
			var k1  = 60 * config.k1 +  1; var l = now <  k1;
			var k2  = 60 * config.k2 + 59; var r = now >= k2;
			return k1 > k2 ? l && r : l || r;
		}
		return true;
	}
	
	function nextTick() {
		var now = getNow(), diff = 1000 - now % 1000;
		window.setTimeout(tick, diff);
		ticked.setTime(now + diff);
	}
	
	function tick() {
		if (test()) {
			var secs = (+ticked + lag) / 1000;
			signal(secs);
			announce(secs);
		}
		nextTick();
	}
	
	// 初期化
	
	var lis = []; // 時刻補正ログ li要素
	
	for (i = 0; i < length; i++) {
		var id = ids[i];
		servers[i] = 'https://' + id + '/cgi-bin/jsont?';
		
		var li = $.createElement('li');
		li.appendChild($.createTextNode(id + ': '));
		var logText = $.createTextNode('―'); // 書き換え用TextNode
		li.appendChild(logText);
		
		lis[i] = li;
		logTexts[i] = logText;
	}
	
	function init() {
		window.setInterval(refresh, interval); // 表示更新開始
		start(); // サーバ時刻取得開始
		nextTick();
	}
	
	$.onreadystatechange = function () {
		this.onreadystatechange = null;
		
		// TODO: hash から設定復元
		
		// head 要素取得
		head = $.getElementsByTagName('head')[0];
		
		// メイン画面
		
		var main = $.getElementById('main');
		
		titleText = $.getElementById('title').firstChild;
		
		h12 = $.getElementById('h12');
		
		// 時間表示 TextNode取得
		var tts = main.getElementsByTagName('tt');
		hrs   = tts[0].firstChild;
		mins  = tts[1].firstChild;
		secs  = tts[2].firstChild;
		ms    = tts[3].firstChild;
		
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
		
		if (speechSynthesis != null) {
			speechSynthesis.onvoiceschanged = onvoiceschanged;
			speechSynthesis.onvoiceschanged();
		}
		
		var id;
		for (id in params) {
			bind(id);
		}
		
		for (id in config) {
			inputs[id] = getInput(id);
		}
		onchange();
		
		$.onkeydown = onkeydown;
		$.onkeyup   = onkeyup;
		
		
		if (this.readyState == 'complete') {
			init();
		} else {
			window.onload = init;
		}
	};
})(window, document);
