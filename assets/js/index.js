let app = {

    state: {
        characters: [],
        relationships: [],
        tags: [],
        filters: [],
        templates: {},
        req_attempt: 0,
        req_success: 0
    },

    util: {
        findChar: (id) => {
            for (let character of app.state.characters) {
                if (character.id == id) {
                    return character;
                }
            }

            throw Error(`Unable to find character with id "${id}"`);
        },

        isFetchingResources: () => {
            return app.state.req_attempt !== app.state.req_success;
        }
    },

    ui: {

        onCloseOverlay: (e) => {
            $("#overlay")
                .hide()
                .find("#modal").empty();
        },

        onCharClick: (e) => {
            $("#overlay").show();

            let character = app.util.findChar(e.data.id);
            if (character.detail) {
                $("#modal").html(Mustache.render(
                    app.state.templates["char-detail"],
                    character));
            } else {
                app.character.load(e.data.id);
            }
        },

        onFilterClick: (e) => {
            $("#overlay").show();

            $("#modal").html(Mustache.render(
                    app.state.templates["filters"],
                    app.state))
                .find(".filter-item").each((i, e) => {
                    let elem = $(e);
                    elem.on("click", {
                        filter: elem.attr("data-tag")
                    }, app.ui.addFilter);
                });
        },

        addFilter: (e) => {
            let filter = e.data.filter;

            switch (filter) {

                case "select_none":
                    app.state.filters = [];
                    app.state.filters.push(...app.state.tags);
                    break;

                case "select_all":
                    app.state.filters = [];
                    break;

                default:
                    if (app.state.filters.includes(filter)) {
                        array.splice(array.indexOf(filter), 1);
                    } else {
                        app.state.filters.push(filter);
                    }
                    break;
            }

            $(".filter-item span").removeClass("filtered");

            for (let filter of app.state.filters) {
                $(`.filter-item[data-tag="${filter}"] span`).addClass("filtered");
            }
        },

        relMap: {

            reset: () => {
                let mapContainer = $("#rel-map");
                let canvas = mapContainer.find("canvas").get(0);
                canvas.width = mapContainer.width();
                canvas.height = mapContainer.height();

                mapContainer.find(".char-info").remove();
            },

            addRelationships: () => {

                const offsetX = 50;
                const offsetY = 50;
                let canvas = $("#rel-map canvas").get(0);
                let ctx = canvas.getContext("2d");
                ctx.lineWidth = 5;
                ctx.strokeStyle = "white";

                ctx.beginPath();

                for (let rel of app.state.relationships) {
                    let startChar = app.util.findChar(rel.characters[0]);
                    let stopChar = app.util.findChar(rel.characters[1]);

                    ctx.moveTo(startChar.loc.x + offsetX, startChar.loc.y + offsetY);
                    ctx.lineTo(stopChar.loc.x + offsetX, stopChar.loc.y + offsetY);
                }

                ctx.stroke();
            },

            addCharacters: () => {
                let mapContainer = $("#rel-map");
                let canvas = mapContainer.find("canvas").get(0);

                // Add divs
                let cx = Math.round(canvas.width / 2.0);
                let cy = Math.round(canvas.height / 2.0);
                let aStep = Math.PI * 2 / app.state.characters.length;
                let r = (cx < cy ? cx : cy) / 1.3;
                let charInfoTemplate = app.state.templates["char-info"];

                for (let i = 0; i < app.state.characters.length; i++) {
                    let character = app.state.characters[i];
                    let a = i * aStep;
                    let x = Math.round(cx + r * Math.cos(a) - 64);
                    let y = Math.round(cy + r * Math.sin(a) - 32);

                    character.loc = {
                        x: x,
                        y: y
                    };

                    mapContainer.append(
                        $(Mustache.render(charInfoTemplate, character))
                        .css("left", x)
                        .css("top", y)
                        .on("click", {
                                "id": character.id
                            },
                            app.ui.onCharClick));
                }
            },

            populate: () => {
                app.ui.relMap.reset();

                if (app.state.characters.length === 0) {
                    return;
                }


                if (app.util.isFetchingResources()) {
                    // Content is still loading
                    return;
                }

                app.ui.relMap.addCharacters();
                app.ui.relMap.addRelationships();
            }

        }
    },

    template: {
        onLoad: (html, status, jqXHR) => {
            let id = jqXHR.responseURL.substring(
                jqXHR.responseURL.lastIndexOf("/") + 1,
                jqXHR.responseURL.lastIndexOf("."));

            app.state.templates[id] = html;
            ++app.state.req_success;
            app.ui.relMap.populate();
        },

        load: (name) => {
            ++app.state.req_attempt;
            $.ajax({
                url: `assets/template/${name}.html`,
                success: app.template.onLoad,
                dataType: "html"
            });
        }
    },

    character: {

        onLoad: (json, status, jqXHR) => {

            let id = jqXHR.responseURL.substring(
                jqXHR.responseURL.lastIndexOf("/") + 1,
                jqXHR.responseURL.lastIndexOf("."));

            ++app.state.req_success;

            switch (id) {

                case "characters":
                    let tags = new Set();
                    for (let character of json) {
                        for (let tag of character.tags) {
                            tags.add(tag);
                        }
                    }
                    app.state.tags = Array.from(tags);
                    app.state.characters = json;
                    app.ui.relMap.populate();
                    break;

                case "relationships":
                    app.state.relationships = json;
                    app.ui.relMap.populate();
                    break;

                default:
                    let character = app.util.findChar(id);
                    character.detail = json;
                    $("#modal").html(Mustache.render(
                        app.state.templates["char-detail"],
                        character));
                    break;
            }
        },


        load: (name) => {
            ++app.state.req_attempt;
            $.ajax({
                url: `assets/data/${name}.json`,
                success: app.character.onLoad,
                dataType: "json"
            });
        }

    },

    start: () => {
        app.template.load("char-detail");
        app.template.load("char-info");
        app.template.load("filters");
        app.character.load("characters");
        app.character.load("relationships");

        window.onresize = app.ui.relMap.populate;
        $("#overlay")
            .hide()
            .click(app.ui.onCloseOverlay)
            .find("#modal").click((e) => e.stopPropagation());

        $("#filter-button").click(app.ui.onFilterClick);
    }
};

$(document).ready(app.start);