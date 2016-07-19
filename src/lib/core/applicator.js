import $ from 'jquery'
import TextQuoteAnchor from 'dom-anchor-text-quote'

// I have a list of selector types
// I have a list of queries to get selector data
// I have a list of functions to apply
class Applicator {
    
    constructor (model) {
        this.model = model;
        this.escape = (s) => s.replace(/[-/\\^$*+?.()（）|[\]{}]/g, '\\$&').replace(/\$/g, '$$$$');
        this.graph = {
            "http://www.w3.org/ns/oa#hasBody": (id) => [
                "SELECT ?id ?subject ?predicate ?object ?graph",
                "WHERE {",
                "GRAPH ?g {?id <http://www.w3.org/ns/oa#hasBody> ?graph } .",
                "GRAPH ?graph {?subject ?predicate ?object}",
                "}"
            ].join("\n")
        }
        this.mark = {
            "http://www.w3.org/ns/oa#TextQuoteSelector": (selector, triple) => {
                var prefix = selector.prefix ? selector.prefix.value : ''
                var exact = selector.exact ? selector.exact.value : ''
                var suffix = selector.suffix ? selector.suffix.value : ''
                // covering for trimmed pre-/suffixes
                prefix = prefix[-1]===' ' ? prefix : prefix+' '
                suffix = [',','.',';',':'].indexOf(suffix[0])+1 ? suffix : ' '+suffix
                $(`:contains('${prefix+exact+suffix}')`).last().html(function (i, o) {
                    // TODO: REPLACE IS STILL TO SLOW [much better with last()]
                    // TODO: NOT ROBUST IN CASE OF N-1 : ANNOTATIONS-TOKEN
                    // TODO: -> USE TEXTQUOTEANNOTATOR ?
                    return o.replace(
                        prefix+exact+suffix,
                        `${prefix}<span class ='perseids-annotation' id='${selector.id.value}'>${exact}</span>${suffix}`
                    );
                })
            }
        };
        this.selectors = {
            "http://www.w3.org/ns/oa#TextQuoteSelector": (id) => [
                "SELECT ?id ?prefix ?exact ?suffix",
                "WHERE {",
                "GRAPH ?g {",
                `${id || "?id"} <http://www.w3.org/ns/oa#hasTarget> ?target .`,
                "?target <http://www.w3.org/ns/oa#hasSelector> ?selector .",
                "?selector <http://www.w3.org/ns/oa#prefix> ?prefix .",
                "?selector <http://www.w3.org/ns/oa#exact> ?exact .",
                "?selector <http://www.w3.org/ns/oa#suffix> ?suffix .",
                "}}"
            ].join("\n")
        };
    }

    load (id)  {
            // get TextSelectors
        this.model.execute(this.selectors["http://www.w3.org/ns/oa#TextQuoteSelector"](id))
            // mark positions in HTML
            .then((data) => {
                data.map((x) => this.mark["http://www.w3.org/ns/oa#TextQuoteSelector"](x))
            })
            // get triples
            .then((data) => this.model.execute(this.graph["http://www.w3.org/ns/oa#hasBody"](id)))

            .then((data) => data.forEach((x) => {
                var element = $(document.getElementById(x.id.value))
                var array = element.data(x.graph.value) || []
                    element.data(x.graph.value,_.concat(array,{subject:x.subject.value, predicate:x.predicate.value,object:x.object.value}))
            }))
            .then((data) => $.getScript('js/marginotes.js'))
            .then((data) => $('.perseids-annotation').marginotes({field:'id'})) // map data or get perseids-annotation class ?
    }
    
}

export default Applicator