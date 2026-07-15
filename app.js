const STRING_NAMES = ["男弦", "中弦", "女弦"];
const FRET_COUNT = 5; // 0=開放, 1〜4=勘所
// 工工四の文字（本調子早見表で確認済みの範囲のみ。4番目の勘所は未確認のため空欄）
const KUNKUNSHI_LABELS = {
  1: ["合", "乙", "老", "四", ""],
  2: ["四", "上", "中", "尺", ""],
  3: ["工", "五", "六", "七", ""],
};
function fretLabel(string, fret) {
  const label = KUNKUNSHI_LABELS[string] && KUNKUNSHI_LABELS[string][fret];
  return label || (fret === 0 ? "開" : String(fret));
}

let state = {
  songKey: null,
  mode: "play", // 'play' | 'manual' | 'edit'
  currentIndex: 0,
  tapIndex: 0,
};

const el = {
  songSelect: document.getElementById("songSelect"),
  audioFile: document.getElementById("audioFile"),
  player: document.getElementById("player"),
  modePlay: document.getElementById("modePlay"),
  modeManual: document.getElementById("modeManual"),
  modeEdit: document.getElementById("modeEdit"),
  modeHint: document.getElementById("modeHint"),
  lyricTrack: document.getElementById("lyricTrack"),
  kunkunshiTrack: document.getElementById("kunkunshiTrack"),
  strings: document.getElementById("strings"),
  manualControls: document.getElementById("manualControls"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  posIndicator: document.getElementById("posIndicator"),
  editPanel: document.getElementById("editPanel"),
  editBody: document.getElementById("editBody"),
  tapBtn: document.getElementById("tapBtn"),
  addNoteBtn: document.getElementById("addNoteBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile"),
  youtubeUrl: document.getElementById("youtubeUrl"),
  youtubeLoadBtn: document.getElementById("youtubeLoadBtn"),
  youtubeContainer: document.getElementById("youtubeContainer"),
};

// --- YouTube連携 ---
// YouTube公式のIFrame Player APIを使って埋め込む（動画のダウンロード・保存は一切行わない）
let ytPlayer = null;
let ytApiReady = false;
let ytActive = false;
let ytPollTimer = null;

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
};

function loadYouTubeVideo(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    alert("YouTubeのURLから動画IDを読み取れなかったやんす。URLを確認してほしいやんす。");
    return;
  }
  el.player.pause();
  ytActive = true;
  el.youtubeContainer.style.display = "block";

  const create = () => {
    if (ytPlayer) {
      ytPlayer.loadVideoById(videoId);
    } else {
      ytPlayer = new YT.Player("youtubePlayer", {
        videoId: videoId,
        playerVars: { playsinline: 1 },
      });
    }
  };
  if (ytApiReady && window.YT && window.YT.Player) {
    create();
  } else {
    const check = setInterval(() => {
      if (ytApiReady && window.YT && window.YT.Player) {
        clearInterval(check);
        create();
      }
    }, 200);
  }
}

el.youtubeLoadBtn.addEventListener("click", () => {
  const url = el.youtubeUrl.value.trim();
  if (url) loadYouTubeVideo(url);
});

function getCurrentTime() {
  if (ytActive && ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
    return ytPlayer.getCurrentTime();
  }
  return el.player.currentTime;
}

function pollYouTubeTime() {
  if (ytActive && ytPlayer && state.mode === "play" && typeof ytPlayer.getPlayerState === "function") {
    if (ytPlayer.getPlayerState() === 1 /* YT.PlayerState.PLAYING */) {
      updateHighlightForTime(getCurrentTime());
    }
  }
  ytPollTimer = requestAnimationFrame(pollYouTubeTime);
}
pollYouTubeTime();

function loadNotesForSong(key) {
  const saved = localStorage.getItem("sanshin-" + key);
  if (saved) {
    try {
      SONGS[key].notes = JSON.parse(saved);
    } catch (e) {
      console.warn("保存データの読み込みに失敗したやんす", e);
    }
  }
}

function saveNotesForSong(key) {
  localStorage.setItem("sanshin-" + key, JSON.stringify(SONGS[key].notes));
}

function currentNotes() {
  return SONGS[state.songKey].notes;
}

function initSongSelect() {
  Object.keys(SONGS).forEach((key) => {
    loadNotesForSong(key);
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = SONGS[key].title;
    el.songSelect.appendChild(opt);
  });
  state.songKey = Object.keys(SONGS)[0];
  el.songSelect.value = state.songKey;
}

el.songSelect.addEventListener("change", () => {
  state.songKey = el.songSelect.value;
  state.currentIndex = 0;
  state.tapIndex = 0;
  renderAll();
});

el.audioFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    ytActive = false;
    el.youtubeContainer.style.display = "none";
    el.player.src = URL.createObjectURL(file);
  }
});

function setMode(mode) {
  state.mode = mode;
  [el.modePlay, el.modeManual, el.modeEdit].forEach((b) => b.classList.remove("active"));
  el.manualControls.style.display = "none";
  el.editPanel.style.display = "none";

  if (mode === "play") {
    el.modePlay.classList.add("active");
    el.modeHint.textContent =
      "音源を再生すると、記録済みのタイミングに合わせて自動でハイライトが進むやんす。";
  } else if (mode === "manual") {
    el.modeManual.classList.add("active");
    el.manualControls.style.display = "flex";
    el.modeHint.textContent = "「前へ／次へ」で自分のペースで1音ずつ確認できるやんす。";
  } else if (mode === "edit") {
    el.modeEdit.classList.add("active");
    el.editPanel.style.display = "block";
    el.modeHint.textContent =
      "教科書を見ながら歌詞・工工四・弦・位置を入力し、再生しながら「今ココ」でタイミングを記録するやんす。";
    renderEditTable();
  }
  renderAll();
}

el.modePlay.addEventListener("click", () => setMode("play"));
el.modeManual.addEventListener("click", () => setMode("manual"));
el.modeEdit.addEventListener("click", () => setMode("edit"));

el.prevBtn.addEventListener("click", () => {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  renderHighlight();
});
el.nextBtn.addEventListener("click", () => {
  state.currentIndex = Math.min(currentNotes().length - 1, state.currentIndex + 1);
  renderHighlight();
});

function updateHighlightForTime(t) {
  const notes = currentNotes();
  let idx = -1;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].t !== null && notes[i].t <= t) idx = i;
  }
  if (idx >= 0 && idx !== state.currentIndex) {
    state.currentIndex = idx;
    renderHighlight();
  }
}

el.player.addEventListener("timeupdate", () => {
  if (state.mode !== "play" || ytActive) return;
  updateHighlightForTime(el.player.currentTime);
});

function renderTracks() {
  const notes = currentNotes();
  el.lyricTrack.innerHTML = "";
  el.kunkunshiTrack.innerHTML = "";
  notes.forEach((n, i) => {
    const lyricCell = document.createElement("div");
    lyricCell.className = "note-cell lyric-cell";
    lyricCell.textContent = n.lyric || "－";
    lyricCell.dataset.index = i;
    lyricCell.addEventListener("click", () => {
      state.currentIndex = i;
      renderHighlight();
    });
    el.lyricTrack.appendChild(lyricCell);

    const kkCell = document.createElement("div");
    kkCell.className = "note-cell kunkunshi-cell";
    kkCell.textContent = n.kunkunshi || "－";
    kkCell.dataset.index = i;
    kkCell.addEventListener("click", () => {
      state.currentIndex = i;
      renderHighlight();
    });
    el.kunkunshiTrack.appendChild(kkCell);
  });
}

function renderStrings() {
  el.strings.innerHTML = "";
  STRING_NAMES.forEach((name, sIdx) => {
    const row = document.createElement("div");
    row.className = "string-row";

    const label = document.createElement("div");
    label.className = "string-name";
    label.textContent = name;
    row.appendChild(label);

    const line = document.createElement("div");
    line.className = "string-line";
    for (let f = 0; f < FRET_COUNT; f++) {
      const dot = document.createElement("div");
      dot.className = "fret-dot";
      dot.dataset.string = sIdx + 1;
      dot.dataset.fret = f;
      dot.textContent = fretLabel(sIdx + 1, f);
      line.appendChild(dot);
    }
    row.appendChild(line);
    el.strings.appendChild(row);
  });
}

function renderHighlight() {
  const notes = currentNotes();
  const current = notes[state.currentIndex];

  document.querySelectorAll(".lyric-cell, .kunkunshi-cell").forEach((cell) => {
    cell.classList.toggle("current", Number(cell.dataset.index) === state.currentIndex);
  });
  const currentLyric = el.lyricTrack.querySelector(".current");
  if (currentLyric) {
    currentLyric.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  document.querySelectorAll(".fret-dot").forEach((dot) => {
    const isActive =
      current &&
      Number(dot.dataset.string) === Number(current.string) &&
      Number(dot.dataset.fret) === Number(current.fret);
    dot.classList.toggle("active", !!isActive);
  });

  el.posIndicator.textContent = `${state.currentIndex + 1} / ${notes.length}`;

  if (state.mode === "edit") {
    document.querySelectorAll("#editBody tr").forEach((tr) => {
      tr.classList.toggle("current", Number(tr.dataset.index) === state.currentIndex);
    });
  }
}

function renderEditTable() {
  const notes = currentNotes();
  el.editBody.innerHTML = "";
  notes.forEach((n, i) => {
    const tr = document.createElement("tr");
    tr.dataset.index = i;

    const idxTd = document.createElement("td");
    idxTd.textContent = i + 1;
    tr.appendChild(idxTd);

    const lyricTd = document.createElement("td");
    const lyricInput = document.createElement("input");
    lyricInput.value = n.lyric;
    lyricInput.placeholder = "歌詞";
    lyricInput.addEventListener("input", () => {
      n.lyric = lyricInput.value;
      saveNotesForSong(state.songKey);
      renderTracks();
      renderHighlight();
    });
    lyricTd.appendChild(lyricInput);
    tr.appendChild(lyricTd);

    const kkTd = document.createElement("td");
    const kkInput = document.createElement("input");
    kkInput.value = n.kunkunshi;
    kkInput.placeholder = "工工四";
    kkInput.addEventListener("input", () => {
      n.kunkunshi = kkInput.value;
      saveNotesForSong(state.songKey);
      renderTracks();
      renderHighlight();
    });
    kkTd.appendChild(kkInput);
    tr.appendChild(kkTd);

    const stringTd = document.createElement("td");
    const stringSelect = document.createElement("select");
    STRING_NAMES.forEach((name, sIdx) => {
      const opt = document.createElement("option");
      opt.value = sIdx + 1;
      opt.textContent = name;
      if (Number(n.string) === sIdx + 1) opt.selected = true;
      stringSelect.appendChild(opt);
    });
    stringSelect.addEventListener("change", () => {
      n.string = Number(stringSelect.value);
      saveNotesForSong(state.songKey);
      renderEditTable();
      renderHighlight();
    });
    stringTd.appendChild(stringSelect);
    tr.appendChild(stringTd);

    const fretTd = document.createElement("td");
    const fretSelect = document.createElement("select");
    for (let f = 0; f < FRET_COUNT; f++) {
      const opt = document.createElement("option");
      opt.value = f;
      const kanji = fretLabel(n.string, f);
      opt.textContent = f === 0 ? `開放（${kanji}）` : kanji;
      if (Number(n.fret) === f) opt.selected = true;
      fretSelect.appendChild(opt);
    }
    fretSelect.addEventListener("change", () => {
      n.fret = Number(fretSelect.value);
      saveNotesForSong(state.songKey);
      renderHighlight();
    });
    fretTd.appendChild(fretSelect);
    tr.appendChild(fretTd);

    const tTd = document.createElement("td");
    tTd.textContent = n.t !== null ? n.t.toFixed(2) : "未記録";
    tr.appendChild(tTd);

    const opTd = document.createElement("td");
    const tapRowBtn = document.createElement("button");
    tapRowBtn.textContent = "このタイミングで記録";
    tapRowBtn.addEventListener("click", () => {
      n.t = getCurrentTime();
      saveNotesForSong(state.songKey);
      renderEditTable();
    });
    opTd.appendChild(tapRowBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.style.marginLeft = "4px";
    delBtn.addEventListener("click", () => {
      notes.splice(i, 1);
      saveNotesForSong(state.songKey);
      renderAll();
    });
    opTd.appendChild(delBtn);

    tr.appendChild(opTd);
    el.editBody.appendChild(tr);
  });
}

el.tapBtn.addEventListener("click", tapTiming);
document.addEventListener("keydown", (e) => {
  if (state.mode === "edit" && e.code === "Space" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    tapTiming();
  }
});

function tapTiming() {
  const notes = currentNotes();
  if (state.tapIndex >= notes.length) {
    alert("全部の音にタイミングを記録し終わったやんす。「＋音符を追加」で増やせるやんす。");
    return;
  }
  notes[state.tapIndex].t = getCurrentTime();
  state.tapIndex++;
  state.currentIndex = Math.min(state.tapIndex, notes.length - 1);
  saveNotesForSong(state.songKey);
  renderEditTable();
  renderHighlight();
}

el.addNoteBtn.addEventListener("click", () => {
  currentNotes().push({ lyric: "", kunkunshi: "", string: 1, fret: 0, t: null });
  saveNotesForSong(state.songKey);
  renderAll();
});

el.exportBtn.addEventListener("click", () => {
  const data = JSON.stringify(SONGS[state.songKey].notes, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.songKey + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

el.importFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const notes = JSON.parse(reader.result);
      SONGS[state.songKey].notes = notes;
      saveNotesForSong(state.songKey);
      state.currentIndex = 0;
      state.tapIndex = 0;
      renderAll();
    } catch (err) {
      alert("JSONの読み込みに失敗したやんす: " + err.message);
    }
  };
  reader.readAsText(file);
});

function renderAll() {
  renderTracks();
  renderStrings();
  if (state.mode === "edit") renderEditTable();
  renderHighlight();
}

initSongSelect();
setMode("play");
