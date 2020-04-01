let app = {

    state: {
        characters: [],
        relationships: [],
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


        relMap: {

            reset: () => {
                let mapContainer = $("#rel-map");
                let canvas = mapContainer.find("canvas").get(0);
                canvas.width = mapContainer.width();
                canvas.height = mapContainer.height();

                mapContainer.find(".char-info").remove();
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
                    let x = cx + r * Math.cos(a)
                    let y = cy + r * Math.sin(a)

                    mapContainer.append(
                        $(Mustache.render(charInfoTemplate, character))
                        .css("left", Math.round(x) - 64)
                        .css("top", Math.round(y) - 32)
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

            if ("characters" === id) {
                app.state.characters = json;
                app.ui.relMap.populate();
            } else {
                let character = app.util.findChar(id);
                character.detail = json;
                $("#modal").html(Mustache.render(
                    app.state.templates["char-detail"],
                    character));
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
        app.character.load("characters");

        window.onresize = app.ui.relMap.populate;
        $("#overlay").hide().click(() => $("#overlay").hide());
    }
};

$(document).ready(app.start);