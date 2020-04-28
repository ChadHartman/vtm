"use strict";

let app = {

    route: {
        root: /^#?(\?.*)?$/,
        charDetail: /^#char\/detail\/\w+(\?.*)?$/,
        filters: /^#filters(\?.*)?$/
    },

    SearchFilterer: class SearchFilterer {
        constructor() {
            this.terms = [];
            let search = new app.QueryParams().search;
            if (search) {
                for (let term of search.split(",")) {
                    if (term) {
                        this.terms.push(this.normalize(term));
                    }
                }
            }
        }

        normalize(text) {
            if (text) {
                return text.toLowerCase().replace(/[^a-z]/g, "");
            }
            return "";
        }

        isFiltered(name) {
            if (this.terms.length === 0) {
                return false;
            }

            for (let term of this.terms) {
                if (this.normalize(name).indexOf(term) !== -1) {
                    return false;
                }
            }

            return true;
        }
    },

    ExclusionFilterer: class ExclusionFilterer {

        constructor() {
            let exclude = new app.QueryParams().exclude;
            this.excludedTags = exclude ? exclude.split(",") : [];
        }

        isExcluded(character) {
            for (let tag of character.tags) {
                if (!this.excludedTags.includes(tag)) {
                    return false;
                }
            }

            return true;
        }
    },

    QueryParams: class QueryParams {

        constructor(hash = location.hash) {
            if (hash.indexOf("?") === -1) {
                return;
            }

            let params = new URLSearchParams(hash.split("?")[1]);

            for (const [key, value] of params) {
                this[key] = value;
            }
        }

        commit() {
            let urlParams = new URLSearchParams();

            for (const key in this) {
                if (this[key]) {
                    urlParams.append(key, this[key]);
                }
            }

            location.hash = (location.hash.indexOf("?") === -1 ?
                    location.hash :
                    location.hash.split("?")[0]) +
                `?${urlParams.toString()}`;
        }
    }
};

app.vue = new Vue({

    el: "#app",

    data: {
        visibility: {
            character_detail: false,
            filter_settings: false,
            overlay: false,
            search_box: false,
            search_button: true
        },
        hovered_character: undefined,
        selected_character: {},
        characters: [],
        relationships: [],
        tags: []
    },

    methods: {

        wireRelationships() {
            if (this.$data.characters.length === 0 ||
                this.$data.relationships.length == 0) {
                // Data is still loading
                return;
            }

            for (let rel of this.$data.relationships) {
                for (let c of this.$data.characters) {
                    if (c.id === rel.characters[0]) {
                        rel.character_start = c;
                        c.relationship_data[rel.characters[1]] = rel.info;
                    } else if (c.id === rel.characters[1]) {
                        rel.character_stop = c;
                        c.relationship_data[rel.characters[0]] = rel.info;
                    }
                }
            }

            this.drawRelmapCanvas();
        },

        drawRelmapCanvas() {

            if (this.$data.characters.length === 0 ||
                this.$data.relationships.length === 0) {
                // Data not yet loaded
                return;
            }

            let draw = (ctx, lineWidth, strokeStyle, isBackground) => {
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = strokeStyle;
                ctx.beginPath();

                for (let rel of this.$data.relationships) {

                    if (rel.character_start.filtered || rel.character_stop.filtered) {
                        continue;
                    }

                    let isHovered = rel.character_start.id === this.$data.hovered_character ||
                        rel.character_stop.id === this.$data.hovered_character;

                    if (isBackground === isHovered) {
                        // hovered_character relationships get drawn on the foreground canvas
                        continue;
                    }

                    let locStart = rel.character_start.loc;
                    let locStop = rel.character_stop.loc;

                    ctx.moveTo(64 + locStart.x, 32 + locStart.y);
                    ctx.lineTo(64 + locStop.x, 32 + locStop.y);
                }

                ctx.stroke();
            };

            let drawCanvas = (isBackground) => {
                let canvas = isBackground ? this.$refs.relmap_canvas_background : this.$refs.relmap_canvas_foreground;
                let ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                draw(ctx, 7, "black", isBackground);
                draw(ctx, 5, "#999", isBackground);
            };

            drawCanvas(true);
            drawCanvas(false);
        },

        /**
         * Updates flags and locations for character info elements
         */
        updateCharacters() {

            let searchFilterer = new app.SearchFilterer();
            let exclusionFilterer = new app.ExclusionFilterer();

            for (let character of this.$data.characters) {

                if ("visible" in character && !character.visible) {
                    character.filtered = true;
                    continue;
                }

                character.filtered = searchFilterer.isFiltered(character.name) ||
                    exclusionFilterer.isExcluded(character);
            }

            this.layoutCharactersCircular();
        },

        onCharactersLoad(json) {

            // Prep chars and grab tags
            let tags = new Set();
            for (let c of json) {
                for (let tag of c.tags) {
                    tags.add(tag);
                }
                c.loc = {
                    x: 0,
                    y: 0
                };
                c.detail_loaded = false;
                c.info = [];
                c.description = "";
                c.history = [];
                c.filtered = false;
                c.relationship_data = {};
            }

            // Update tags with query strings
            let exclusions = new app.ExclusionFilterer().excludedTags;

            this.$data.tags = [];
            for (let tag of tags) {
                this.$data.tags.push({
                    id: tag,
                    excluded: exclusions.indexOf(tag) !== -1
                });
            }

            this.$data.tags.sort((a, b) => a.id > b.id ? 1 : -1);
            this.$data.characters = json;

            this.wireRelationships();
            this.updateCharacters();
            this.refreshRoute();
        },

        onCharacterDetailLoad(json) {
            let c = this.$data.selected_character;
            c.detail_loaded = true;
            c.info = json.info;
            c.description = json.description;
            c.history = json.history;
        },

        onWindowResize() {
            let container = this.$refs.relmap_container;
            let backCanvas = this.$refs.relmap_canvas_background;
            let foreCanvas = this.$refs.relmap_canvas_foreground;
            backCanvas.width = container.offsetWidth;
            backCanvas.height = container.offsetHeight;
            foreCanvas.width = container.offsetWidth;
            foreCanvas.height = container.offsetHeight;
            this.updateCharacters();
            this.drawRelmapCanvas();
        },

        onHashChange(e) {

            if (e.oldURL.indexOf("?") !== -1 && e.newURL.indexOf("?") === -1) {
                // Need to migrate query params
                //  Set query params will call hash change again
                new app.QueryParams(e.oldURL).commit();
                return;
            }

            if (app.route.root.exec(location.hash)) {
                this.$data.visibility.overlay = false;
                this.$data.visibility.character_detail = false;
                this.$data.visibility.filter_settings = false;

            } else if (app.route.charDetail.exec(location.hash)) {
                this.$data.visibility.overlay = true;
                this.$data.visibility.character_detail = true;
                this.$data.visibility.filter_settings = false;
                this.prepareCharacterDetailView();

            } else if (app.route.filters.exec(location.hash)) {
                this.$data.visibility.overlay = true;
                this.$data.visibility.character_detail = false;
                this.$data.visibility.filter_settings = true;

            } else {
                console.error(`Unkown path "${location.hash}".`);
                location.hash = "";
            }
        },

        layoutCharactersCircular() {

            let characters = [];
            for (let character of this.$data.characters) {
                if (!character.filtered) {
                    characters.push(character);
                }
            }

            let canvas = this.$refs.relmap_canvas_background;
            let cx = Math.round(canvas.width / 2.0);
            let cy = Math.round(canvas.height / 2.0);
            let aStep = Math.PI * 2 / characters.length;
            let r = (cx < cy ? cx : cy) / 1.3;
            for (let i = 0; i < characters.length; i++) {
                let loc = characters[i].loc;
                let a = i * aStep;
                loc.x = Math.round(cx + r * Math.cos(a) - 64);
                loc.y = Math.round(cy + r * Math.sin(a) - 32);
            }
        },

        hideOverlay() {
            location.hash = "";
        },

        prepareCharacterDetailView() {

            if (this.$data.characters.length === 0) {
                // Data hasn't loaded yet
                return;
            }

            let id = location.hash.substr("#char/detail/".length);
            if (id.indexOf("?") !== -1) {
                id = id.split("?")[0];
            }

            for (let c of this.$data.characters) {
                if (c.id === id) {
                    this.$data.selected_character = c;
                    break;
                }
            }

            if (!this.$data.selected_character.detail_loaded) {
                $.get(`assets/data/${id}.json`, this.onCharacterDetailLoad);
            }
        },

        refreshRoute() {
            this.onHashChange(new HashChangeEvent("refresh", {
                newURL: location.toString(),
                oldURL: location.toString()
            }));
        },

        onToggledFilter(tag, e) {

            // Stop overlay from picking up click
            e.stopPropagation();

            let exclusions = [];

            switch (tag) {

                case "select_none":
                    for (let t of this.$data.tags) {
                        exclusions.push(t.id);
                        t.excluded = true;
                    }
                    break;

                case "select_all":
                    for (let t of this.$data.tags) {
                        t.excluded = false;
                    }
                    break;

                default:
                    for (let t of this.$data.tags) {
                        if (tag === t.id) {
                            t.excluded = !t.excluded;
                        }

                        if (t.excluded) {
                            exclusions.push(t.id);
                        }
                    }
                    break;
            }

            let params = new app.QueryParams();

            if (exclusions.length === 0) {
                delete params.exclude;
            } else {
                params.exclude = exclusions.join(",");
            }

            params.commit();
            this.updateCharacters();
            this.drawRelmapCanvas();
        },

        onClickSearchButton() {
            this.$data.visibility.search_button = false;
            this.$data.visibility.search_box = true;

            this.$nextTick(() => {
                this.$refs.search_box.value = new app.QueryParams().search || "";
                this.$refs.search_box.focus();
            });
        },

        onSearchBoxExit() {
            this.$data.visibility.search_button = true;
            this.$data.visibility.search_box = false;
        },

        onSearchBoxChange() {
            let search = this.$refs.search_box.value;
            let params = new app.QueryParams();
            if (search) {
                params.search = search;
            } else {
                delete params.search;
            }
            params.commit();
            this.updateCharacters();
            this.drawRelmapCanvas();
        },

        onRelationshipsLoad(json) {
            this.$data.relationships = json;
            this.wireRelationships();
        },

        onCharInfoMouseOver(cid) {
            this.$data.hovered_character = cid;
            this.drawRelmapCanvas();
        },

        onCharInfoMouseLeave() {
            this.$data.hovered_character = undefined;
            this.drawRelmapCanvas();
        }
    },

    created() {
        window.addEventListener("resize", this.onWindowResize);
        window.addEventListener('hashchange', this.onHashChange);
    },

    mounted() {
        $.get("assets/data/characters.json", this.onCharactersLoad);
        $.get("assets/data/relationships.json", this.onRelationshipsLoad);
        this.onWindowResize();
        this.refreshRoute();
    },

    destroyed() {
        window.removeEventListener("resize", this.onWindowResize);
        window.removeEventListener('hashchange', this.onHashChange);
    },
});