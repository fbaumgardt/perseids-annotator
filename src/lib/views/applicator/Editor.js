import Templates from '../annotator/Templates'
import SNAP from '../../models/ontologies/SNAP'
import OA from '../../models/ontologies/OA'
import Utils from '../../utils'
import wrapRangeText from 'wrap-range-text'
import _ from 'lodash'
import $ from 'jquery'

const getFunction = Symbol()

class Editor {

    constructor(app) {
        var self = this
        var jqParent = app.anchor
        this.annotator = () => app.annotator
        var origin = {}
        var selector = {}

        var labels = SNAP.labels

        // UI ELEMENTS
        var template = new Templates(labels)
        var button = $('<div class="btn btn-primary edit_btn" data-toggle="modal" data-target="#edit_modal"><span class="glyphicon glyphicon-cog"></span></div>')
        var modal = $(`<div id="edit_modal" class="modal fade in" style="display: none; ">
            <div class="well"><div class="modal-header">
                <a class="close" data-dismiss="modal">×</a>
                <h3>Annotation Editor</h3>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer">
            <button type="button" class="btn btn-primary" data-dismiss="modal" title="Apply changes">Apply</button>
            </div>
        </div>`).appendTo(jqParent)
        var body = modal.find('.modal-body')
        var apply_button = modal.find('.btn-primary')

        // FUNCTIONS
        modal.update = (data, newSelector) => {
            // planned: apply ontology-specific transformations
            var graphs = app.ontology.simplify(data)
            selector = newSelector
            template.init(body,{annotations:Object.keys(graphs).map((k) => { return {g:k,triples:graphs[k]}})})
        }
        $('body').on('shown.bs.popover',(e) => $('#'+e.target.getAttribute('aria-describedby')).find('.popover-footer').append(button))
        jqParent.mouseup((e) => {

            if ($(e.target).closest('#global-view').length) return
            var pos = $('#popover-selection')
            if (pos) {
                pos.popover('destroy')
                pos.replaceWith(pos.text())
            }

            var selection = document.getSelection();

            // replace starter with
            if (selection && !selection.isCollapsed && modal.css('display')==='none') {
                // add selector to modal or button

                var selector = OA.create("http://www.w3.org/ns/oa#TextQuoteSelector")(jqParent,selection);

                modal.update({},selector)
                span = document.createElement('span')
                span.setAttribute('id','popover-selection')
                span.setAttribute('data-graphs','{}')
                wrapRangeText(span,selection.getRangeAt(0))
                origin = $('#popover-selection')
                origin.popover({
                    container:"body",
                    html:"true",
                    trigger: "manual",
                    placement: "auto top",
                    title: selector.exact,
                    content: "<div class='popover-footer'/>"
                })
                origin.popover('show')
            }

        })
        this[getFunction] = {
            "delete_graphs": () => {
                var dG = body.find('.graph.old.delete')
                var delete_graphs = dG.map((i,el) => $(el).data('graph')).get()
                dG.remove()
                return delete_graphs
            },
            "delete_triples": (annotations) => {
                var dT = body.find('.graph.old .triple.delete')
                var delete_triples = _.flatten(
                    _.zip(dT.closest('.graph.old').map((i,el) => $(el).data('graph')), dT.map((i,el) => $(el).data('original-subject')), dT.map((i,el) => $(el).data('original-predicate')), dT.map((i,el) => $(el).data('original-object')))
                        .map((zipped) => {return {g:zipped[0],s:zipped[1],p:zipped[2],o:zipped[3]}})
                        .map((gspo) => app.ontology.expand(gspo, annotations))
                )
                dT.remove()
                return delete_triples
            },
            "update_triples": () => {
                var uT = body.find('.graph.old .triple.update')
                var update_triples = _.zip(uT.closest('.graph.old').map((i,el) => $(el).data('graph')), uT.map((i,el) => $(el).data('original-subject')), uT.map((i,el) => $(el).data('original-predicate')), uT.map((i,el) => $(el).data('original-object')), uT.map((i,el) => $(el).attr('data-subject')), uT.map((i,el) => $(el).attr('data-predicate')), uT.map((i,el) => $(el).attr('data-object')))
                return update_triples
            },
            "create_triples": (annotations, cite) => {
                var cT = body.find('.graph.new .triple:not(.delete)')
                var new_triples = _.flatten(_.zip(cT.map((i,el) => $(el).attr('data-subject')), cT.map((i,el) => $(el).attr('data-predicate')), cT.map((i,el) => $(el).attr('data-object')))
                    .filter((t)=> t[0] && t[1] && t[2])
                    .map((t) => {return {g:cite,s:t[0],p:t[1],o:t[2]}})
                    .map((t) => app.ontology.expand(t,annotations)))
                _.assign(selector,{id:cite+"#sel-"+Utils.hash(JSON.stringify(selector)).slice(0, 4)})
                var selector_triples = OA.expand(selector.type)(_.mapValues(selector,(v) => v.replace(new RegExp('\n','ig'),'')))
                var create_triples = new_triples.length ? _.concat(new_triples,selector_triples) : []
                return create_triples
            }
        }

        /**
         * We are done editing and are now processing, in order:
         * 1. Pre-existing annotation bodies that have been completely deleted
         * 2. Partially deleted annotation bodies
         * 3. Modified annotation bodies
         * 4. Newly created annotation body
         */
        apply_button.click((e) => {

            // get prerequisite data
            let annotations = origin.data('annotations')
            let cite = Utils.cite(app.getUser()+app.getUrn(),Math.random().toString())

            // retrieve data
            let delete_graphs = this[getFunction].delete_graphs()
            let delete_triples = this[getFunction].delete_triples(annotations)
            let update_triples = this[getFunction].update_triples()
            let create_triples = this[getFunction].create_triples(annotations, cite)

            // send to annotator
            var acc = []
            let annotator = this.annotator()
                annotator
                .drop(delete_graphs)
                .then((res) => {
                    acc.push(res)
                    return annotator.delete(_.concat(delete_triples,delete_graphs.map((id) => annotations[id])))
                })
                .then((res) => {
                    acc.push(res)
                    return annotator.update(_.flatten(update_triples.map((t) => { return app.ontology.expand({ g:t[0], s:t[1], p:t[2], o:t[3] },annotations)})),
                        _.flatten(update_triples.map((t) => { return app.ontology.expand({ g:t[0], s:t[4], p:t[5], o:t[6] },annotations)}))
                    )
                })
                .then((res) => {
                    acc.push(res)
                    return annotator.create(cite,create_triples)
                })
                .then((res) => annotator.apply(_.flatten(acc.concat(res))))

            origin.popover('hide')
        })

        this.register = (jqElement) => {
            jqElement.click((e) => {
                origin = jqElement
                modal.update(jqElement.data('annotations'),jqElement.data('selector'))
            })
        }

    }
}

export default Editor