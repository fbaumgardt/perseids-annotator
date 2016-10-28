import $ from 'jquery';
import SPARQL from '../models/sparql'
import Utils from '../utils'

// planned: think about api - stacking commands, then executing them, in order to facilitate single step history?

const defaultGraph = "http://data.perseus.org/graphs/persons"
const userId = Symbol()
const urn = Symbol()
const anchor = Symbol()
const model = Symbol()
const applicator = Symbol()
const history = Symbol()

/**
 * Class for creation of annotations
 *
 */
class Annotator {

    // API: create(fragment), update(fragments), delete(fragment), drop(graph)

    constructor(app) {
        this[userId] = app.anchor.data('user')
        this[urn] = app.anchor.data('urn')
        this[anchor] = app.anchor
        this[model] = app.model;
        this[applicator] = app.applicator;
        this[history] = app.history;

        // todo: this is part of the base module
        this.modal = $('<div id="edit_modal" class="modal fade in" style="display: none; "><div class="well"><div class="modal-header"><a class="close" data-dismiss="modal">×</a><h3>Annotation Editor</h3></div><div class="modal-body"></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-dismiss="modal" title="Apply changes">Apply</button></div></div>')
        app.anchor.append(this.modal)

        app.anchor.mouseup((e) => {

            // Don't use selection inside #global-view
            if ($(e.target).closest('#global-view').length) return

            // If selection exists, remove it
            var pos = $('#popover-selection')
            if (pos) {
                pos.popover('destroy')
                pos.replaceWith(pos.text())
            }

            var selection = document.getSelection();

            // replace starter with
            if (selection && !selection.isCollapsed && this.modal.css('display')==='none') {
                // add selector to modal or button

                var selector = OA.create("http://www.w3.org/ns/oa#TextQuoteSelector")(app.anchor,selection);

                // modal.update({},selector)
                var span = document.createElement('span')
                span.setAttribute('id','popover-selection')
                span.setAttribute('data-annotations','{}')
                span.setAttribute('data-selector',JSON.stringify(selector))
                wrapRangeText(span,selection.getRangeAt(0))
                span = $('#popover-selection')
                span.popover({
                    container:"body",
                    html:"true",
                    trigger: "manual",
                    placement: "auto top",
                    title: selector.exact,
                    content: "<div class='popover-footer'/>"
                })
                span.popover('show')
            }

        })

    }

    /**
     * DROP: delete entire annotations including metadata
     * Takes the ids in list.drop and
     * @param graphs Object where graphs.triples (Array[Object]) is a list of GSPOs to delete and graphs.ids (Array[String]) is the list of annotation ids to be cleared
     */
    drop(graphs) {
        this[model].defaultDataset = this[model].defaultDataset.filter((ds) => !graphs.indexOf(ds)+1)
        this[model].namedDataset = this[model].namedDataset.filter((ds) => !graphs.indexOf(ds)+1)
        return this[model].execute(graphs.map((uri) => `DROP GRAPH <${uri}>`))
    }

    /**
     *
     * @param deletions () is the list
     */
    delete (deletions) {
        return _.flatten(deletions || []).length ? this[model].execute(SPARQL.bindingsToDelete(_.flatten(deletions).map((gspo) => gspo.g.value ? gspo : SPARQL.gspoToBinding(gspo)))) : []
    }

    /**
     *
     * @param deletions
     * @param insertions
     */
    update(deletions, insertions) {
        // todo: remove old title, add new title
        return this[model].execute(_.flatten([
            SPARQL.bindingsToDelete(_.flatten(deletions).map((gspo) => gspo.g.value ? gspo : SPARQL.gspoToBinding(gspo))),
            SPARQL.bindingsToInsert(_.flatten(insertions.concat(
                // filter for graphs, map to graphid, get uniq
                _.uniq(insertions.map((i) => i.g.value || i.g)).map((annotationId) => [
                    {
                        "p": { "type":"uri", "value":"http://www.w3.org/ns/oa#annotatedAt" },
                        "g": { "type":"uri", "value": defaultGraph},
                        "s": { "type":"uri", "value":annotationId }, //
                        "o": { "datatype": "http://www.w3.org/2001/XMLSchema#dateTimeStamp", "type":"literal", "value": (new Date()).toISOString()}
                    }, {"p": { "type":"uri", "value":"http://www.w3.org/ns/oa#annotatedBy" },
                        "g": { "type":"uri", "value": defaultGraph },
                        "s": { "type":"uri", "value": annotationId },
                        "o": { "type":"uri", "value": this[userId] }}
                ])
            )).map((gspo) => gspo.g.value ? gspo : SPARQL.gspoToBinding(gspo)))
        ]))
    }


    /**
     *
     * @param list
     */
    create (annotationId, bindings) {
        var result = $.Deferred().resolve([]).promise()
        if (bindings.length) {
            // planned: figure out default graph for use cases (maybe motivatedBy, by plugin or manual in anchor?)
            var selectorId = _.find(bindings, (binding) => binding.p.value === "http://www.w3.org/ns/oa#exact").s.value
            var object = _.find(bindings, (binding) => binding.p.value.endsWith("bond-with")).o.value
            var bond = _.find(bindings, (binding) => binding.p.value.endsWith("has-bond")).o.value
            var predicate = _.find(bindings, (binding) => binding.s.value === bond && binding.p.value.endsWith("bond-with")).o.value
            var title = [
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://purl.org/dc/terms/title"},
                    "o": {"type": "literal", "value": `${object} identifies ${object.replace('http://data.perseus.org/people/smith:','').split('-')[0]} as ${predicate} in ${this[urn]}`}
                }
            ]
            // planned: make independent of selector type
            var targetId = annotationId + "#target-" + Utils.hash(JSON.stringify(selectorId)).slice(0, 4)
            var oa = [
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"},
                    "o": {"type": "uri", "value": "http://www.w3.org/ns/oa#Annotation"}
                },
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://purl.org/dc/terms/source"},
                    "o": {"type": "uri", "value": "https://github.com/perseids-project/plokamos"}
                },
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#serializedBy"},
                    "o": {"type": "uri", "value": "https://github.com/perseids-project/plokamos"} // todo: add version
                },
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#motivatedBy"},
                    "o": {"type": "uri", "value": "http://www.w3.org/ns/oa#identifying"}
                },
                {
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#hasBody"},
                    "o": {"type": "uri", "value": annotationId}
                }
            ]

            var target = [
                {
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#hasTarget"},
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "o": {"type": "uri", "value": targetId}
                },
                {
                    "p": {"type": "uri", "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"},
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": targetId},
                    "o": {"type": "uri", "value": "http://www.w3.org/ns/oa#SpecificResource"}
                }, // planned: figure out alternatives for non-text targets
                {
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#hasSource"},
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": targetId},
                    "o": {"type": "uri", "value": this[urn]}
                },
                {
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#hasSelector"},
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": targetId},
                    "o": {"type": "uri", "value": selectorId}
                }
            ]

            var date = [{
                "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#annotatedAt"},
                "g": {"type": "uri", "value": defaultGraph},
                "s": {"type": "uri", "value": annotationId},
                "o": {
                    "datatype": "http://www.w3.org/2001/XMLSchema#dateTimeStamp",
                    "type": "literal",
                    "value": (new Date()).toISOString()
                }
            }]


            var user = [
                {
                    "p": {"type": "uri", "value": "http://www.w3.org/ns/oa#annotatedBy"},
                    "g": {"type": "uri", "value": defaultGraph},
                    "s": {"type": "uri", "value": annotationId},
                    "o": {"type": "uri", "value": this[userId]}
                } // NOTE: describe <o> query
            ]
            this[model].defaultDataset.push(annotationId)
            this[model].namedDataset.push(annotationId)
            var insert = SPARQL.bindingsToInsert(_.flatten([oa, date, user, target, title, bindings]).map((gspo) => gspo.g.value ? gspo : SPARQL.gspoToBinding(gspo)))
            result = this[model].execute(insert)
        }
        return result
    }

    apply (resolved) {
        // check if all successful (what about drop?)
        // if success, map to sparql and add sparql to history
        // else reset model
        this[history].add(resolved.map((r) => r.sparql))
        // this.history.commit()
        this[applicator].reset()
    }
}

export default Annotator