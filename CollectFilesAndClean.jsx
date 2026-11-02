// CollectFilesAndClean.jsx
// After Effects 2024 ~ /  メニュー実行型
//
// 「ファイルを収集」(Collect Files) のスクリプト版。日本語版 AE の標準機能だと「(フッテージ)」など
// 日本語のフォルダ名になるため、英語表記のフォルダ構成で収集する。
//
//   保存先/<プロジェクト名> Folder/
//       <プロジェクト名>.aep                 ← 「プロジェクトも保存」ON の時（フッテージのリンクを収集先へ張り替え）
//       <プロジェクト名> Report.txt          ← 収集結果（コピーしたファイル/見つからなかったファイル）
//       (Footage)/<元フォルダ名>/<ファイル>   ← フッテージ（元のフォルダ名ごとに整理。同名フォルダは _2 _3 …）
//
//   収集するソースファイル:
//     すべて                 : プロジェクト内の全フッテージ（使われていないものも含む）
//     すべてのコンポジション用 : いずれかのコンポジションで使われているフッテージのみ
//   連番（イメージシーケンス）は、同じフォルダ内の同じ名前パターンのファイルを全てコピーする。
//   「未使用のコンポ/フッテージを削除」（任意。「プロジェクトも保存」ON かつ元のプロジェクトがファイルの時のみ）:
//     収集用に保存するプロジェクトからだけ削除し、元のファイルは変更しない（レポートに削除一覧）。
//     コンポ=どのコンポにも使われておらず、レンダーキューにも無いもの（最上位の書き出し用コンポも対象）。
//     フッテージ=どのコンポにも使われていないもの（コンポ削除後に再計算）。
//   レポートには、プロジェクトで使用しているフォント（PostScript名・ファミリー/スタイル・使用コンポ）と、
//   サードパーティ製エフェクト（matchName が ADBE / CC / Pseudo で始まらないもの）の一覧も出力する。
//   平面・プレースホルダ・見つからないファイルは対象外（見つからないものはレポートに記載）。
//
//   「プロジェクトも保存」ON: フッテージのリンクを収集先へ張り替えて、収集フォルダ内に .aep を保存する。
//     保存すると現在開いているプロジェクトは収集先のものに切り替わるため、
//   「CPPl_cleaner で容量を削減」ON: 保存した .aep を C:\\CPPl_cleaner.exe に渡して軽量化する（先にプロジェクトを閉じる）。
//     元の収集 .aep は「<名前>_original.aep」として残り、軽量化後のファイルが元の名前になる。サイズの前後はレポートに追記。
//     「完了後に元のプロジェクトを開き直す」ON（既定）で、元のファイルを開き直す（元のファイルは変更しない）。
//     元のプロジェクトが未保存（ファイル無し）の場合は開き直せない。

(function () {
    // 収集後の .aep を渡して容量削減するツールがある場所（パス）をここで指定する！
    var CLEANER_PATH = "C:\\CPPl_cleaner.exe";

    // 収集先のフォルダ名の末尾に付ける文字列（英語表記）
    var FOLDER_SUFFIX = " Folder";
    var FOOTAGE_DIR = "(Footage)";
    var origFile = app.project.file;   // 未保存なら null

    // ---------------- ダイアログ ----------------
    var dlg = new Window("dialog", "ファイルを収集（英語フォルダ構成）");
    dlg.orientation = "column"; dlg.alignChildren = "fill"; dlg.margins = 14; dlg.spacing = 8;

    var g1 = dlg.add("group"); g1.alignChildren = ["left", "center"];
    g1.add("statictext", undefined, "プロジェクト名:").preferredSize.width = 100;
    var projDefault = origFile ? decodeURI(origFile.name).replace(/\.aep[x]?$/i, "") : "Project";
    var eName = g1.add("edittext", undefined, projDefault); eName.characters = 32;

    var g2 = dlg.add("group"); g2.alignChildren = ["left", "center"];
    g2.add("statictext", undefined, "保存先:").preferredSize.width = 100;
    var eDest = g2.add("edittext", undefined, ""); eDest.characters = 40;
    var bBrowse = g2.add("button", undefined, "参照…");
    bBrowse.onClick = function () {
        var f = Folder.selectDialog("収集先のフォルダを選択");
        if (f) eDest.text = f.fsName;
    };

    var g3 = dlg.add("group"); g3.alignChildren = ["left", "center"];
    g3.add("statictext", undefined, "ソースファイルを収集:").preferredSize.width = 140;
    var ddMode = g3.add("dropdownlist", undefined, ["すべて", "すべてのコンポジション用"]);
    ddMode.selection = 1;

    var cbSave = dlg.add("checkbox", undefined, "プロジェクトも保存し、フッテージのリンクを収集先へ張り替える");
    cbSave.value = true;
    var cbReopen = dlg.add("checkbox", undefined, "完了後に元のプロジェクトを開き直す（元のファイルは変更しない）");
    cbReopen.value = !!origFile;
    cbReopen.enabled = !!origFile;
    var cbClean = dlg.add("checkbox", undefined, "収集後の .aep を CPPl_cleaner に渡して容量を削減する");
    cbClean.value = new File(CLEANER_PATH).exists;
    var cbDelComp = dlg.add("checkbox", undefined, "未使用のコンポを削除する（どのコンポからも使われておらず、レンダーキューにも無いもの）");
    var cbDelFoot = dlg.add("checkbox", undefined, "未使用のフッテージを削除する（コンポ削除後に使われなくなったものも含む）");
    cbDelComp.value = false; cbDelFoot.value = false;
    function syncDel() {
        cbClean.enabled = cbSave.value && new File(CLEANER_PATH).exists;
        if (!cbClean.enabled) cbClean.value = false;
        // 削除は収集用に保存するプロジェクトにだけ反映し、元のファイルは変えない。
        // そのため「プロジェクトも保存」ON かつ 元のプロジェクトがファイルとして存在する時だけ選べる
        var ok = cbSave.value && !!origFile;
        cbDelComp.enabled = ok; cbDelFoot.enabled = ok;
        if (!ok) { cbDelComp.value = false; cbDelFoot.value = false; }
    }
    cbSave.onClick = function () { cbReopen.enabled = cbSave.value && !!origFile; syncDel(); };
    syncDel();

    var bg = dlg.add("group"); bg.alignment = "right";
    bg.add("button", undefined, "収集", { name: "ok" });
    bg.add("button", undefined, "キャンセル", { name: "cancel" });
    if (dlg.show() !== 1) return;

    var projName = eName.text.replace(/^\s+|\s+$/g, "");
    if (!projName) { alert("プロジェクト名を入力してください。"); return; }
    if (!eDest.text) { alert("保存先フォルダを指定してください。"); return; }
    var destRoot = new Folder(eDest.text);
    if (!destRoot.exists) { alert("保存先フォルダが存在しません:\n" + destRoot.fsName); return; }
    var allMode = (ddMode.selection.index === 0);

    // ---------------- 未使用コンポ/フッテージの削除（収集用プロジェクトのみ）----------------
    var removedComps = [], removedFoot = [];
    if (cbDelComp.value || cbDelFoot.value) {
        var queuedIds = {}, rq = app.project.renderQueue;
        for (var qi = 1; qi <= rq.numItems; qi++) { try { queuedIds[rq.item(qi).comp.id] = true; } catch (eq) {} }
        function unusedComps() {
            var out = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if ((it instanceof CompItem) && it.usedIn.length === 0 && !queuedIds[it.id]) out.push(it);
            }
            return out;
        }
        function unusedFootage() {
            var out = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if ((it instanceof FootageItem) && it.usedIn.length === 0) out.push(it);
            }
            return out;
        }
        var cCount = cbDelComp.value ? unusedComps().length : 0;
        var fCount = cbDelFoot.value ? unusedFootage().length : 0;
        if (!confirm("収集用プロジェクトから、未使用のコンポ " + cCount + " 件" + (cbDelFoot.value ? "、未使用のフッテージ " + fCount + " 件（コンポ削除前の数。削除後に増える分は別）" : "") +
                     " を削除します（元のプロジェクトのファイルは変更しません）。\n" +
                     "※どのコンポからも使われていない最上位のコンポ（書き出し用など）も削除されます。\n実行しますか？")) return;
        if (cbDelComp.value) {
            var uc = unusedComps();
            for (var d1 = 0; d1 < uc.length; d1++) { removedComps.push(uc[d1].name); uc[d1].remove(); }
        }
        if (cbDelFoot.value) {
            var uf = unusedFootage();   // コンポ削除後に再計算（それで使われなくなった分も含む）
            for (var d2 = 0; d2 < uf.length; d2++) { removedFoot.push(uf[d2].name); uf[d2].remove(); }
        }
    }

    // ---------------- 収集対象 ----------------
    var targets = [], missing = [], skipped = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (!(it instanceof FootageItem)) continue;
        var ms = it.mainSource;
        if (ms instanceof SolidSource || ms instanceof PlaceholderSource) continue;
        if (!(ms instanceof FileSource)) continue;
        if (!allMode && it.usedIn.length === 0) { skipped.push(it.name); continue; }
        if (!ms.file || !ms.file.exists) { missing.push(it.name + "   (" + (ms.file ? ms.file.fsName : "no file") + ")"); continue; }
        targets.push(it);
    }
    if (!targets.length) { alert("収集できるフッテージがありません。"); return; }

    // ---------------- フォルダ作成 ----------------
    var collectDir = new Folder(destRoot.fsName + "/" + projName + FOLDER_SUFFIX);
    if (!collectDir.exists) collectDir.create();
    var footageDir = new Folder(collectDir.fsName + "/" + FOOTAGE_DIR);
    if (!footageDir.exists) footageDir.create();

    // 元フォルダ -> (Footage) 内のサブフォルダ名（同名で別パスなら _2 _3 …）
    var dirMap = {}, nameUsed = {};
    function subFolderFor(srcFolder) {
        var key = srcFolder.fsName;
        if (dirMap[key]) return dirMap[key];
        var base = decodeURI(srcFolder.name) || "root", nm = base, n = 1;
        while (nameUsed[nm]) { n++; nm = base + "_" + n; }
        nameUsed[nm] = true;
        var f = new Folder(footageDir.fsName + "/" + nm);
        if (!f.exists) f.create();
        dirMap[key] = f;
        return f;
    }
    function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function isSequence(item) { return /\[\d+-\d+\]/.test(item.name); }

    // ---------------- コピー ----------------
    var copied = [], failed = [], relink = [];   // relink: {item, newFile, seq}
    var done = {};                                // 同じ元ファイルを複数アイテムが使う場合の重複コピー防止
    for (var t = 0; t < targets.length; t++) {
        var item = targets[t], srcFile = item.mainSource.file;
        var sub = subFolderFor(srcFile.parent);
        var seq = isSequence(item);
        var files = [];
        if (seq) {
            // 先頭フレームのファイル名の最後の数字列をパターン化して、同じフォルダ内の連番を全て集める
            var m = decodeURI(srcFile.name).match(/^(.*?)(\d+)(\.[^.]*)?$/);
            if (m) {
                var re = new RegExp("^" + esc(m[1]) + "\\d+" + esc(m[3] || "") + "$");
                var all = srcFile.parent.getFiles();
                for (var a = 0; a < all.length; a++) {
                    if (all[a] instanceof File && re.test(decodeURI(all[a].name))) files.push(all[a]);
                }
            }
            if (!files.length) files.push(srcFile);
        } else {
            files.push(srcFile);
        }
        var firstNew = null, ok = true;
        for (var f = 0; f < files.length; f++) {
            var dst = new File(sub.fsName + "/" + files[f].name);
            if (!done[dst.fsName]) {
                done[dst.fsName] = true;
                if (!dst.exists) {
                    if (!files[f].copy(dst)) { failed.push(files[f].fsName); ok = false; continue; }
                }
            }
            if (files[f].fsName === srcFile.fsName) firstNew = dst;
        }
        if (ok) {
            copied.push(item.name + "  ->  " + sub.name + "/" + (firstNew ? firstNew.name : "?") + (seq ? "  (" + files.length + " frames)" : ""));
            if (firstNew) relink.push({ item: item, newFile: firstNew, seq: seq });
        }
    }

    // ---------------- プロジェクト保存（リンク張り替え）----------------
    var savedPath = null, saveNote = "";
    if (cbSave.value) {
        try {
            for (var r = 0; r < relink.length; r++) {
                if (relink[r].seq) relink[r].item.replaceWithSequence(relink[r].newFile, false);
                else relink[r].item.replace(relink[r].newFile);
            }
            var aep = new File(collectDir.fsName + "/" + projName + ".aep");
            app.project.save(aep);
            savedPath = aep.fsName;
        } catch (e) {
            saveNote = "プロジェクトの保存/リンク張り替えでエラー: " + e.toString();
        }
    }

    // ---------------- 使用フォント / サードパーティ製エフェクトの一覧 ----------------
    // 全コンポのレイヤーを走査。フォント=テキストレイヤーのソーステキスト（キーフレームがあれば各キー）の font。
    // エフェクト=matchName が "ADBE" / "CC " / "Pseudo" で始まらないもの（サードパーティ製とみなす）。
    var fontMap = {}, fxMap = {}, fontOrder = [], fxOrder = [];
    function addUse(map, order, key, info, compName) {
        if (!map[key]) { map[key] = { info: info, comps: {}, count: 0 }; order.push(key); }
        map[key].count++;
        map[key].comps[compName] = true;
    }
    function isBuiltin(mn) { return /^(ADBE|CC |Pseudo)/.test(mn); }
    for (var ci = 1; ci <= app.project.numItems; ci++) {
        var cp = app.project.item(ci);
        if (!(cp instanceof CompItem)) continue;
        for (var li = 1; li <= cp.numLayers; li++) {
            var lyr = cp.layer(li);
            try {
                var fxg = lyr.property("ADBE Effect Parade");
                if (fxg) {
                    for (var e = 1; e <= fxg.numProperties; e++) {
                        var ef = fxg.property(e);
                        if (!isBuiltin(ef.matchName)) addUse(fxMap, fxOrder, ef.matchName, ef.name, cp.name);
                    }
                }
            } catch (e1) {}
            if (lyr instanceof TextLayer) {
                try {
                    var st = lyr.property("ADBE Text Properties").property("ADBE Text Document");
                    var docs = [];
                    if (st.numKeys > 0) { for (var k = 1; k <= st.numKeys; k++) docs.push(st.keyValue(k)); }
                    else docs.push(st.value);
                    for (var d = 0; d < docs.length; d++) {
                        var fam = "", sty = "";
                        try { fam = docs[d].fontFamily; sty = docs[d].fontStyle; } catch (e2) {}
                        addUse(fontMap, fontOrder, docs[d].font, (fam ? fam + " / " + sty : ""), cp.name);
                    }
                } catch (e3) {}
            }
        }
    }
    function compList(m) { var a = []; for (var k in m.comps) if (m.comps.hasOwnProperty(k)) a.push(k); return a; }

    // ---------------- レポート ----------------
    var NL = "\r\n", R = [];
    R.push("Collect Files Report  -  " + projName);
    R.push("Collected to: " + collectDir.fsName);
    R.push("Mode: " + (allMode ? "All" : "For All Comps"));
    R.push("");
    R.push("Copied footage: " + copied.length);
    for (var c1 = 0; c1 < copied.length; c1++) R.push("  " + copied[c1]);
    if (failed.length) { R.push(""); R.push("Copy failed: " + failed.length); for (var c2 = 0; c2 < failed.length; c2++) R.push("  " + failed[c2]); }
    if (missing.length) { R.push(""); R.push("Missing source files: " + missing.length); for (var c3 = 0; c3 < missing.length; c3++) R.push("  " + missing[c3]); }
    if (skipped.length) { R.push(""); R.push("Not used by any comp (skipped): " + skipped.length); for (var c4 = 0; c4 < skipped.length; c4++) R.push("  " + skipped[c4]); }
    if (removedComps.length) { R.push(""); R.push("Removed unused comps: " + removedComps.length); for (var c5 = 0; c5 < removedComps.length; c5++) R.push("  " + removedComps[c5]); }
    if (removedFoot.length) { R.push(""); R.push("Removed unused footage: " + removedFoot.length); for (var c6 = 0; c6 < removedFoot.length; c6++) R.push("  " + removedFoot[c6]); }
    R.push(""); R.push("Fonts used: " + fontOrder.length + "   (PostScript name  [family / style]  - used in comps)");
    fontOrder.sort();
    for (var f1 = 0; f1 < fontOrder.length; f1++) {
        var fm = fontMap[fontOrder[f1]], fc = compList(fm);
        R.push("  " + fontOrder[f1] + (fm.info ? "  [" + fm.info + "]" : "") + "  - " + fc.slice(0, 5).join(", ") + (fc.length > 5 ? " ... (+" + (fc.length - 5) + ")" : ""));
    }
    R.push(""); R.push("Third-party effects: " + fxOrder.length + "   (matchName  [display name]  x uses  - used in comps)");
    fxOrder.sort();
    for (var f2 = 0; f2 < fxOrder.length; f2++) {
        var xm = fxMap[fxOrder[f2]], xc = compList(xm);
        R.push("  " + fxOrder[f2] + "  [" + xm.info + "]  x" + xm.count + "  - " + xc.slice(0, 5).join(", ") + (xc.length > 5 ? " ... (+" + (xc.length - 5) + ")" : ""));
    }
    if (savedPath) { R.push(""); R.push("Project saved: " + savedPath); }
    if (saveNote) { R.push(""); R.push(saveNote); }
    var rep = new File(collectDir.fsName + "/" + projName + " Report.txt");
    rep.encoding = "UTF-8";
    if (rep.open("w")) { rep.write(R.join(NL)); rep.close(); }

    // ---------------- CPPl_cleaner で容量削減 ----------------
    // 保存した .aep が開いたままだとファイルを差し替えられないため、先にプロジェクトを閉じてから実行する
    var closed = false, cleanNote = "";
    if (savedPath && cbClean.value) {
        try {
            var aepFile = new File(savedPath), before = aepFile.length;
            app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
            closed = true;
            var cmd = 'cmd.exe /c ""' + CLEANER_PATH + '" "' + aepFile.fsName + '""';
            var out = system.callSystem(cmd);
            var after = new File(savedPath).length;
            cleanNote = "CPPl_cleaner: " + Math.round(before / 1024) + " KB -> " + Math.round(after / 1024) + " KB";
            var rep2 = new File(collectDir.fsName + "/" + projName + " Report.txt");
            rep2.encoding = "UTF-8";
            if (rep2.open("a")) {
                rep2.write("\r\n" + cleanNote + "\r\n" + (out ? "cleaner output: " + out + "\r\n" : ""));
                rep2.close();
            }
        } catch (e3) { saveNote += " CPPl_cleaner の実行でエラー: " + e3.toString(); }
    }

    // ---------------- 元のプロジェクトを開き直す ----------------
    if (savedPath && cbReopen.value && origFile && origFile.exists) {
        try {
            if (!closed) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
            app.open(origFile);
            closed = false;
        } catch (e2) { saveNote += " 元のプロジェクトを開き直せませんでした: " + e2.toString(); }
    } else if (closed) {
        try { app.open(new File(savedPath)); } catch (e4) {}   // 開き直さない場合は、軽量化した .aep を開く
    }

    // 問題があった時だけ通知
    if (failed.length || missing.length || saveNote) {
        alert("収集は完了しましたが、確認が必要な項目があります。\nレポート: " + rep.fsName +
              "\nコピー失敗: " + failed.length + " / 見つからない: " + missing.length + (saveNote ? "\n" + saveNote : ""));
    }
})();
