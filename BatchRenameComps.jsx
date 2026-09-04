/**
 * BatchRenameComps.jsx
 * After Effects 2024 (ExtendScript)
 *
 * プロジェクトパネルで複数選択したコンポジションの名前を
 * 文字列マッチ（検索 → 置換）で一括変更します。
 *
 * 使い方:
 *   1) プロジェクトパネルでコンポを複数選択
 *   2) ファイル > スクリプト > スクリプトファイルを実行... で本ファイルを選択
 *      （ScriptUI Panels フォルダに入れると ウィンドウ メニューから常駐パネルとして使えます）
 *   3) 検索文字列・置換文字列を入れて プレビューを確認 → [実行]
 */

(function (thisObj) {

    var SCRIPT_NAME = "コンポ名 一括リネーム";

    // ---------------------------------------------------------------
    // ユーティリティ
    // ---------------------------------------------------------------

    /** 正規表現のメタ文字をエスケープ（通常の文字列マッチ用） */
    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /** 数値をゼロ埋め */
    function pad(n, digits) {
        var s = String(n);
        while (s.length < digits) { s = "0" + s; }
        return s;
    }

    /** プロジェクトパネルの選択アイテムを取得 */
    function getSelection(compsOnly) {
        var sel = app.project.selection;
        var out = [];
        for (var i = 0; i < sel.length; i++) {
            if (compsOnly && !(sel[i] instanceof CompItem)) { continue; }
            out.push(sel[i]);
        }
        return out;
    }

    /** 1 件ぶんの新しい名前を計算 */
    function buildNewName(oldName, opt, index) {
        var name = oldName;

        // --- 検索 → 置換 ---
        if (opt.find !== "") {
            var flags = "";
            if (opt.replaceAll) { flags += "g"; }
            if (!opt.caseSensitive) { flags += "i"; }

            var pattern = opt.useRegex ? opt.find : escapeRegex(opt.find);
            var re;
            try {
                re = new RegExp(pattern, flags);
            } catch (e) {
                throw new Error("正規表現が不正です: " + e.toString());
            }

            // 置換文字列内の $1 などは「正規表現」モードのときだけ有効にする
            var repl = opt.useRegex ? opt.replace : opt.replace.replace(/\$/g, "$$$$");
            name = name.replace(re, repl);
        }

        // --- 前後に付加 ---
        if (opt.prefix !== "") { name = opt.prefix + name; }
        if (opt.suffix !== "") { name = name + opt.suffix; }

        // --- 連番 ---
        if (opt.useNumber) {
            var num = pad(opt.numStart + index * opt.numStep, opt.numDigits);
            name = opt.numAtHead ? (num + opt.numSep + name) : (name + opt.numSep + num);
        }

        return name;
    }

    /** UI から設定値を読む */
    function readOptions(ui) {
        return {
            find:          ui.etFind.text,
            replace:       ui.etReplace.text,
            caseSensitive: ui.cbCase.value,
            useRegex:      ui.cbRegex.value,
            replaceAll:    ui.cbAll.value,
            compsOnly:     ui.cbCompsOnly.value,
            prefix:        ui.etPrefix.text,
            suffix:        ui.etSuffix.text,
            useNumber:     ui.cbNumber.value,
            numStart:      parseInt(ui.etNumStart.text, 10) || 0,
            numStep:       parseInt(ui.etNumStep.text, 10) || 1,
            numDigits:     parseInt(ui.etNumDigits.text, 10) || 1,
            numSep:        ui.etNumSep.text,
            numAtHead:     ui.rbNumHead.value
        };
    }

    /** 対象一覧と新名称のペアを作る */
    function computePlan(opt) {
        var items = getSelection(opt.compsOnly);
        var list = [];
        var err = "";
        try {
            for (var i = 0; i < items.length; i++) {
                var oldName = items[i].name;
                list.push({
                    item: items[i],
                    oldName: oldName,
                    newName: buildNewName(oldName, opt, i)
                });
            }
        } catch (e) {
            err = e.toString();
        }
        return { list: list, error: err };
    }

    // ---------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 12;

        var ui = {};

        // ---- 検索 / 置換 ----
        var gMain = win.add("panel", undefined, "文字列マッチ");
        gMain.orientation = "column";
        gMain.alignChildren = ["fill", "top"];
        gMain.margins = [10, 16, 10, 10];
        gMain.spacing = 6;

        var r1 = gMain.add("group");
        r1.add("statictext", undefined, "検索:").preferredSize.width = 48;
        ui.etFind = r1.add("edittext", undefined, "");
        ui.etFind.alignment = ["fill", "center"];
        ui.etFind.characters = 24;

        var r2 = gMain.add("group");
        r2.add("statictext", undefined, "置換:").preferredSize.width = 48;
        ui.etReplace = r2.add("edittext", undefined, "");
        ui.etReplace.alignment = ["fill", "center"];
        ui.etReplace.characters = 24;

        var r3 = gMain.add("group");
        ui.cbCase  = r3.add("checkbox", undefined, "大文字小文字を区別");
        ui.cbRegex = r3.add("checkbox", undefined, "正規表現");
        ui.cbAll   = r3.add("checkbox", undefined, "すべて置換");
        ui.cbAll.value = true;

        var r4 = gMain.add("group");
        ui.cbCompsOnly = r4.add("checkbox", undefined, "コンポのみ対象（OFF でフッテージ／フォルダも）");
        ui.cbCompsOnly.value = true;

        // ---- 前後付加 ----
        var gFix = win.add("panel", undefined, "前後に付加");
        gFix.orientation = "row";
        gFix.alignChildren = ["left", "center"];
        gFix.margins = [10, 16, 10, 10];
        gFix.add("statictext", undefined, "接頭:");
        ui.etPrefix = gFix.add("edittext", undefined, "");
        ui.etPrefix.characters = 10;
        gFix.add("statictext", undefined, "接尾:");
        ui.etSuffix = gFix.add("edittext", undefined, "");
        ui.etSuffix.characters = 10;

        // ---- 連番 ----
        var gNum = win.add("panel", undefined, "連番");
        gNum.orientation = "column";
        gNum.alignChildren = ["left", "top"];
        gNum.margins = [10, 16, 10, 10];
        gNum.spacing = 6;

        var n1 = gNum.add("group");
        ui.cbNumber  = n1.add("checkbox", undefined, "連番を付ける");
        ui.rbNumHead = n1.add("radiobutton", undefined, "先頭");
        ui.rbNumTail = n1.add("radiobutton", undefined, "末尾");
        ui.rbNumTail.value = true;

        var n2 = gNum.add("group");
        n2.add("statictext", undefined, "開始:");
        ui.etNumStart = n2.add("edittext", undefined, "1");
        ui.etNumStart.characters = 4;
        n2.add("statictext", undefined, "刻み:");
        ui.etNumStep = n2.add("edittext", undefined, "1");
        ui.etNumStep.characters = 4;
        n2.add("statictext", undefined, "桁:");
        ui.etNumDigits = n2.add("edittext", undefined, "2");
        ui.etNumDigits.characters = 4;
        n2.add("statictext", undefined, "区切り:");
        ui.etNumSep = n2.add("edittext", undefined, "_");
        ui.etNumSep.characters = 4;

        // ---- プレビュー ----
        var gPrev = win.add("panel", undefined, "プレビュー");
        gPrev.orientation = "column";
        gPrev.alignChildren = ["fill", "fill"];
        gPrev.margins = [10, 16, 10, 10];
        ui.lstPreview = gPrev.add("listbox", undefined, [], {
            numberOfColumns: 2,
            showHeaders: true,
            columnTitles: ["変更前", "変更後"],
            columnWidths: [200, 200]
        });
        ui.lstPreview.preferredSize = [420, 170];
        ui.lstPreview.alignment = ["fill", "fill"];

        ui.stStatus = win.add("statictext", undefined, "プロジェクトパネルでコンポを選択してください。");
        ui.stStatus.alignment = ["fill", "top"];

        // ---- ボタン ----
        var gBtn = win.add("group");
        gBtn.alignment = ["fill", "bottom"];
        gBtn.alignChildren = ["fill", "center"];
        var btnPreview = gBtn.add("button", undefined, "プレビュー更新");
        var btnRun     = gBtn.add("button", undefined, "実行");

        // ---- 動作 ----
        function refresh() {
            var opt = readOptions(ui);
            var plan = computePlan(opt);
            ui.lstPreview.removeAll();

            if (plan.error !== "") {
                ui.stStatus.text = "エラー: " + plan.error;
                return null;
            }
            if (plan.list.length === 0) {
                ui.stStatus.text = "対象がありません。プロジェクトパネルで選択してください。";
                return plan;
            }

            var changed = 0;
            for (var i = 0; i < plan.list.length; i++) {
                var row = ui.lstPreview.add("item", plan.list[i].oldName);
                row.subItems[0].text = plan.list[i].newName;
                if (plan.list[i].oldName !== plan.list[i].newName) { changed++; }
            }
            ui.stStatus.text = "選択 " + plan.list.length + " 件 / 変更されるのは " + changed + " 件";
            return plan;
        }

        function run() {
            var plan = refresh();
            if (plan === null) { return; }
            if (plan.list.length === 0) {
                alert("対象がありません。", SCRIPT_NAME);
                return;
            }

            var applied = 0;
            app.beginUndoGroup(SCRIPT_NAME);
            try {
                for (var i = 0; i < plan.list.length; i++) {
                    var p = plan.list[i];
                    if (p.newName === p.oldName) { continue; }
                    if (p.newName === "") { continue; } // 空名はスキップ
                    p.item.name = p.newName;
                    applied++;
                }
            } catch (e) {
                alert("処理中にエラーが発生しました:\n" + e.toString(), SCRIPT_NAME);
            } finally {
                app.endUndoGroup();
            }

            refresh();
            ui.stStatus.text = applied + " 件をリネームしました。";
        }

        btnPreview.onClick = refresh;
        btnRun.onClick = run;

        // 入力のたびに自動プレビュー
        var live = [ui.etFind, ui.etReplace, ui.etPrefix, ui.etSuffix,
                    ui.etNumStart, ui.etNumStep, ui.etNumDigits, ui.etNumSep];
        for (var i = 0; i < live.length; i++) { live[i].onChanging = refresh; }

        var toggles = [ui.cbCase, ui.cbRegex, ui.cbAll, ui.cbCompsOnly,
                       ui.cbNumber, ui.rbNumHead, ui.rbNumTail];
        for (var j = 0; j < toggles.length; j++) { toggles[j].onClick = refresh; }

        win.onResizing = win.onResize = function () { this.layout.resize(); };

        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
        }

        refresh();
        return win;
    }

    buildUI(thisObj);

})(this);
