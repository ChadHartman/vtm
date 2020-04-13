"use strict"

let app = {

    log: {

        LOG_LEVEL: 1,
        DEBUG: 1,
        VERBOSE: 0,

        debug: (message) => {

            if (app.log.LOG_LEVEL <= app.log.DEBUG) {
                console.debug(message + "\n" + new Error().stack.split("\n")[2]);
            }
        },

        verbose: (message) => {

            if (app.log.LOG_LEVEL <= app.log.VERBOSE) {
                console.debug(message + "\n" + new Error().stack.split("\n")[2]);
            }
        },
    },

    constants: {
        REL_OFFSET_X: 50,
        REL_OFFSET_Y: 50
    },

    util: {
        avg: (nums) => {
            let sum = 0;
            for (let num of nums) {
                sum += num;
            }
            return sum / nums.length;
        }

    },

    filter: {

        // Only filtered if all tags are missing
        isFiltered: (character) => {

            let filters = app.filter.getFilters();

            if (filters.length === 0) {
                return false;
            }

            for (let tag of character.tags) {
                if (!filters.includes(tag)) {
                    return false;
                }
            }

            return true;
        },

        getFilters: () => {
            let filters = app.route.query.parse().get("filter");
            if (filters) {
                return filters.split(",");
            }
            return [];
        },


        setFilters: (filters) => {
            let params = app.route.query.parse();
            params.set("filter", filters.join(","));
            app.route.query.update(params);
        },

        update: () => {
            $(".filter-item span").removeClass("filtered");

            for (let filter of app.filter.getFilters()) {
                $(`.filter-item[data-tag="${filter}"] span`).addClass("filtered");
            }
        },

        show: () => {

            if (!app.template.ready() || !app.model.ready()) {
                app.log.verbose("Unable to show; still fetching resources.");
                return;
            }

            app.log.verbose("Display Filters called.");

            let overlay = $("#overlay");

            if (overlay.css("display") === "none") {
                app.log.verbose("Unhiding overlay; and populating.");
                overlay.show()
                    .find("#modal")
                    .html(app.template.render("filters", app.model))
                    .find(".filter-item").each((i, e) => {
                        let elem = $(e);
                        elem.on("click", {
                            filter: elem.attr("data-tag")
                        }, app.filter.toggle);
                    });
            }

            app.filter.update();
        },

        toggle: (e) => {

            let filter = e.data.filter;
            let filters = app.filter.getFilters();

            switch (filter) {

                case "select_none":
                    app.log.debug("Filtering all.");
                    filters = [];
                    filters.push(...app.model.tags);
                    break;

                case "select_all":
                    app.log.debug("Filtering none.");
                    filters = [];
                    break;

                default:
                    if (filters.includes(filter)) {
                        app.log.debug(`Removing ${filter} filter`);
                        filters.splice(filters.indexOf(filter), 1);
                    } else {
                        app.log.debug(`Filtering ${filter}`);
                        filters.push(filter);
                    }
                    break;
            }

            app.filter.setFilters(filters);
        }
    },

    relMap: {

        getCanvas: () => {
            return $("#rel-map canvas").get(0);
        },

        reset: () => {
            let mapContainer = $("#rel-map");
            let canvas = app.relMap.getCanvas();
            canvas.width = mapContainer.width();
            canvas.height = mapContainer.height();

            mapContainer.find(".char-info, .rel-info").remove();
        },

        drawRelationships: (ctx, lineWidth, strokeStyle, relationships) => {

            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeStyle;

            ctx.beginPath();

            for (let rel of relationships) {
                let startChar = app.model.getChar(rel.characters[0]);
                let stopChar = app.model.getChar(rel.characters[1]);

                ctx.moveTo(
                    startChar.loc.x + app.constants.REL_OFFSET_X,
                    startChar.loc.y + app.constants.REL_OFFSET_Y);
                ctx.lineTo(
                    stopChar.loc.x + app.constants.REL_OFFSET_X,
                    stopChar.loc.y + app.constants.REL_OFFSET_Y);
            }

            ctx.stroke();
        },

        addRelationshipElems: () => {

            let mapContainer = $("#rel-map");

            // Check filters
            let relationships = [];
            for (let rel of app.model.relationships) {
                let startChar = app.model.getChar(rel.characters[0]);
                let stopChar = app.model.getChar(rel.characters[1]);

                if (!app.filter.isFiltered(startChar) &&
                    !app.filter.isFiltered(stopChar)) {

                    relationships.push(rel);
                    mapContainer.append(
                        $(app.template.render("rel-info", rel))
                        .css("left", Math.round(app.util.avg([
                            startChar.loc.x + app.constants.REL_OFFSET_X - 10,
                            stopChar.loc.x + app.constants.REL_OFFSET_X - 10
                        ])))
                        .css("top", Math.round(app.util.avg([
                            startChar.loc.y + app.constants.REL_OFFSET_Y - 10,
                            stopChar.loc.y + app.constants.REL_OFFSET_Y - 10
                        ]))));
                }
            }

            if (relationships.length === 0) {
                return;
            }

            let ctx = $("#rel-map canvas").get(0).getContext("2d");

            app.relMap.drawRelationships(ctx, 7, "black", relationships);
            app.relMap.drawRelationships(ctx, 5, "#999", relationships);
        },

        addCharacterElems: () => {

            let mapContainer = $("#rel-map");
            let characters = app.model.getVisibleChars();
            let layout = app.layout.get(characters.length);
            let ix = layout.x.entries();
            let iy = layout.y.entries();

            for (let character of characters) {

                character.loc = {
                    x: ix.next().value[1],
                    y: iy.next().value[1]
                };

                mapContainer.append(
                    $(app.template.render("char-info", character))
                    .css("left", character.loc.x)
                    .css("top", character.loc.y));
            }
        },

        populate: () => {

            if (!app.model.ready() || !app.template.ready()) {
                // Content is still loading
                return;
            }

            app.relMap.reset();
            app.relMap.addCharacterElems();
            app.relMap.addRelationshipElems();

            app.log.verbose("Rendered relmap.")
        }
    },

    template: {

        ready: () => {
            return app.template.store.req_success === app.template.store.req_attempt;
        },

        store: {
            req_attempt: 0,
            req_success: 0,
        },

        load: (name) => {
            ++app.template.store.req_attempt;

            let onLoad = (html) => {
                app.log.verbose(`Template "${name}" loaded.`);
                app.template.store[name] = html;
                ++app.template.store.req_success;
                app.route.refresh();
            };

            $.ajax({
                url: `assets/template/${name}.html`,
                success: onLoad,
                dataType: "html"
            });
        },

        render: (templateName, data) => {

            if (!(templateName in app.template.store)) {
                return `Template named "${templateName}" was not found.`;
            }

            return Mustache.render(
                app.template.store[templateName],
                data);
        }
    },

    charDetail: {

        show: (id) => {

            if (app.model.characters.length === 0) {
                app.log.verbose(`app.model.characters not yet populated.`);
                return;
            }

            let modal = $("#overlay")
                .show()
                .find("#modal").empty();

            let c = app.model.getChar(id);
            if (c.detail) {
                modal.html(app.template.render("char-detail", c));
            } else {
                app.model.loadCharacter(id);
            }
        }
    },

    model: {

        req_attempt: 0,
        req_success: 0,

        ready: () => {
            return app.model.req_attempt === app.model.req_success;
        },

        characters: [],
        relationships: [],
        tags: [],

        getChar: (id) => {
            for (let c of app.model.characters) {
                if (c.id === id) {
                    return c;
                }
            }

            throw Error(`Unable to find character "${id}"`);
        },

        getVisibleChars: () => {
            let characters = [];
            for (let c of app.model.characters) {
                if (!app.filter.isFiltered(c)) {
                    characters.push(c);
                }
            }
            return characters;
        },

        loadCharacter: (id) => {

            let onLoad = (json) => {
                app.log.verbose(`Character "${id} loaded.`);
                ++app.model.req_success;
                app.model.getChar(id).detail = json;
                app.route.refresh();
            };

            ++app.model.req_attempt;
            $.ajax({
                url: `assets/data/${id}.json`,
                success: onLoad,
                dataType: "json"
            });
        },

        onCharactersLoad: (json) => {

            app.log.verbose("Characters loaded.");

            ++app.model.req_success;
            let tags = new Set();
            for (let c of json) {
                for (let tag of c.tags) {
                    tags.add(tag);
                }
            }
            app.model.tags = Array.from(tags);
            app.model.characters = json;
            app.route.refresh();
        },

        loadCharacters: () => {
            ++app.model.req_attempt;
            $.ajax({
                url: "assets/data/characters.json",
                success: app.model.onCharactersLoad,
                dataType: "json"
            });
        },

        onRelationshipsLoad: (json) => {

            app.log.verbose("Relationships loaded.");

            ++app.model.req_success;
            app.model.relationships = json;
            app.route.refresh();
        },

        loadRelationships: () => {
            ++app.model.req_attempt;
            $.ajax({
                url: "assets/data/relationships.json",
                success: app.model.onRelationshipsLoad,
                dataType: "json"
            });
        }
    },

    route: {

        query: {

            parse: (s = location.hash) => {

                if (s.indexOf("?") === -1) {
                    return new URLSearchParams();
                }

                return new URLSearchParams(s.split("?")[1]);
            },

            update: (params) => {
                location.hash = app.route.query.append(location.hash, params);
            },

            append: (url, params) => {

                if (url.indexOf("?") === -1) {
                    return url + "?" + params.toString();
                }

                return url.split("?")[0] + "?" + params.toString();
            }
        },



        pattern: {
            root: /^#?(\?.*)?$/,
            charDetail: /^#char\/detail\/\w+(\?.*)?$/,
            filters: /^#filters(\?.*)?$/
        },

        toIndex: () => {
            location.hash = "";
        },

        refresh: () => {
            app.log.verbose("Refresh Called");
            app.route.onHashChange(new HashChangeEvent("refresh", {
                newURL: location.hash,
                oldURL: location.hash
            }));
        },

        onHashChange: (e) => {

            let oldParams = app.route.query.parse(e.oldURL);
            let newParams = app.route.query.parse(e.newURL);
            if (oldParams.toString().length > 0 && newParams.toString().length === 0) {
                // The old params need to be migrated over
                let newHash = e.newURL.indexOf("#") === -1 ? "" : e.newURL.split("#")[1];
                location.hash = app.route.query.append(newHash, oldParams);
                app.log.verbose("Migrated params");
                return;
            }

            if (app.route.pattern.root.exec(location.hash)) {
                app.log.verbose("Route index");
                $("#overlay").hide();
                app.relMap.populate();

            } else if (app.route.pattern.charDetail.exec(location.hash)) {
                let id = location.hash.substr(location.hash.lastIndexOf("/") + 1);
                if (id.indexOf("?") !== -1) {
                    id = id.split("?")[0];
                }
                app.log.verbose(`Route detail "${id}"`);
                app.charDetail.show(id);

            } else if (app.route.pattern.filters.exec(location.hash)) {
                app.log.verbose("Route filters");
                app.filter.show();

            } else {
                console.error(`Unkown path "${location.hash}".`);
                location.hash = "";
            }
        },

        init: () => {
            window.addEventListener('hashchange', app.route.onHashChange, false);
            app.route.refresh();
        }
    },

    layout: {

        /**
            f1| n2-4 | c4
            	* *
            	* *

            f2| n5-8 | c8
            	 * * *
            	 *   *
            	 * * *

            f3| n9-12 | c12
            	* * * *
            	*     *
            	*     *
                * * * *
            fn | (((n-1)*4)+1)-(n*4) | (n*4)
        */
        getSquare: (size) => {

            let canvas = app.relMap.getCanvas();
            let sideLen = canvas.width < canvas.height ? canvas.width : canvas.height;

            // Seeded with init pos centered
            let xList = [Math.round((canvas.width - sideLen) / 2) + 50];
            let yList = [Math.round((canvas.height - sideLen) / 2) + 50];

            // Use to determine size of square
            let factor = Math.ceil(size / 4.0);

            // factor + 1 because a side has f + 1 elements
            let offset = Math.round(sideLen / (factor + 1));

            // Subcounter used to track which side
            let si = 0;
            let side = 0;
            let i = 0;

            // Skip first one
            for (i = 1; i < size; i++) {

                switch (side) {
                    case 0:
                        // Go right
                        xList.push(xList[i - 1] + offset);
                        yList.push(yList[i - 1]);
                        break;

                    case 1:
                        // Go down
                        xList.push(xList[i - 1]);
                        yList.push(yList[i - 1] + offset);
                        break;

                    case 2:
                        // Go left
                        xList.push(xList[i - 1] - offset);
                        yList.push(yList[i - 1]);
                        break;

                    case 3:
                        // Go up
                        xList.push(xList[i - 1]);
                        yList.push(yList[i - 1] - offset);
                        break;
                }

                if (++si === factor) {
                    // Turned a corner
                    si = 0;
                    ++side;
                }
            }

            return {
                x: xList,
                y: yList
            };
        },

        getCircular: (size) => {

            let canvas = app.relMap.getCanvas();
            let cx = Math.round(canvas.width / 2.0);
            let cy = Math.round(canvas.height / 2.0);
            let aStep = Math.PI * 2 / size;
            let r = (cx < cy ? cx : cy) / 1.3;
            let xList = [];
            let yList = [];

            for (let i = 0; i < size; i++) {
                let a = i * aStep;
                xList.push(Math.round(cx + r * Math.cos(a) - 64));
                yList.push(Math.round(cy + r * Math.sin(a) - 32));
            }

            return {
                x: xList,
                y: yList
            };
        },

        get: (size) => {
            return app.layout.getCircular(size);
            // return app.layout.getSquare(size);
        },

        init: () => {
            $("#button-layout-square").click(() => {
                $("#button-layout-square").hide();
                $("#button-layout-round").show();
                app.layout.get = app.layout.getSquare;
                app.route.refresh();
            });

            $("#button-layout-round").click(() => {
                $("#button-layout-square").show();
                $("#button-layout-round").hide();
                app.layout.get = app.layout.getCircular;
                app.route.refresh();
            }).hide();
        }
    },

    start: () => {
        app.log.verbose("Start begin.");

        app.template.load("char-detail");
        app.template.load("char-info");
        app.template.load("filters");
        app.template.load("rel-info");
        app.model.loadCharacters();
        app.model.loadRelationships();
        app.layout.init();
        app.route.init();

        window.onresize = app.route.refresh;

        $("#overlay")
            .hide()
            .click(app.route.toIndex)
            .find("#modal").click((e) => e.stopPropagation());

        app.log.verbose("Start complete.");
    }
};

$(document).ready(app.start);