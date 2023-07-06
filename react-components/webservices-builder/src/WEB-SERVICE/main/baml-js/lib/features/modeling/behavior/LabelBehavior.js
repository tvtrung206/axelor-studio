import { assign } from "min-dash";

import inherits from "inherits";

import { is, getBusinessObject } from "../../../util/ModelUtil";

import {
  isLabelExternal,
  getExternalLabelMid,
  hasExternalLabel,
  isLabel,
} from "../../../util/LabelUtil";

import { getLabel } from "../../label-editing/LabelUtil";

import { getLabelAdjustment } from "./util/LabelLayoutUtil";

import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";

import { getNewAttachPoint } from "diagram-js/lib/util/AttachUtil";

import { getMid, roundPoint } from "diagram-js/lib/layout/LayoutUtil";

import { delta } from "diagram-js/lib/util/PositionUtil";

import { sortBy } from "min-dash";

import { getDistancePointLine, perpendicularFoot } from "./util/GeometricUtil";

let DEFAULT_LABEL_DIMENSIONS = {
  width: 90,
  height: 20,
};

let NAME_PROPERTY = "name";
let TEXT_PROPERTY = "text";

/**
 * A component that makes sure that external labels are added
 * together with respective elements and properly updated (DI wise)
 * during move.
 *
 * @param {EventBus} eventBus
 * @param {Modeling} modeling
 * @param {BpmnFactory} bpmnFactory
 * @param {TextRenderer} textRenderer
 */
export default function LabelBehavior(
  eventBus,
  modeling,
  bpmnFactory,
  textRenderer
) {
  CommandInterceptor.call(this, eventBus);

  // update label if name property was updated
  this.postExecute("element.updateProperties", function (e) {
    let context = e.context,
      element = context.element,
      properties = context.properties;

    if (NAME_PROPERTY in properties) {
      modeling.updateLabel(element, properties[NAME_PROPERTY]);
    }

    if (TEXT_PROPERTY in properties && is(element, "bpmn:TextAnnotation")) {
      let newBounds = textRenderer.getTextAnnotationBounds(
        {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        },
        properties[TEXT_PROPERTY] || ""
      );

      modeling.updateLabel(element, properties.text, newBounds);
    }
  });

  // create label shape after shape/connection was created
  this.postExecute(["shape.create", "connection.create"], function (e) {
    let context = e.context,
      hints = context.hints || {};

    if (hints.createElementsBehavior === false) {
      return;
    }

    let element = context.shape || context.connection,
      businessObject = element.businessObject;

    if (isLabel(element) || !isLabelExternal(element)) {
      return;
    }

    // only create label if attribute available
    if (!getLabel(element)) {
      return;
    }

    let labelCenter = getExternalLabelMid(element);

    // we don't care about x and y
    let labelDimensions = textRenderer.getExternalLabelBounds(
      DEFAULT_LABEL_DIMENSIONS,
      getLabel(element)
    );

    modeling.createLabel(element, labelCenter, {
      id: businessObject.id + "_label",
      businessObject: businessObject,
      width: labelDimensions.width,
      height: labelDimensions.height,
    });
  });

  // update label after label shape was deleted
  this.postExecute("shape.delete", function (event) {
    let context = event.context,
      labelTarget = context.labelTarget,
      hints = context.hints || {};

    // check if label
    if (labelTarget && hints.unsetLabel !== false) {
      modeling.updateLabel(labelTarget, null, null, { removeShape: false });
    }
  });

  // update di information on label creation
  this.postExecute(["label.create"], function (event) {
    let context = event.context,
      element = context.shape,
      businessObject,
      di;

    // we want to trigger on real labels only
    if (!element.labelTarget) {
      return;
    }

    // we want to trigger on BPMN elements only
    if (!is(element.labelTarget || element, "bpmn:BaseElement")) {
      return;
    }

    businessObject = element.businessObject;
    di = businessObject.di;

    if (!di.label) {
      di.label = bpmnFactory.create("bpmndi:BPMNLabel", {
        bounds: bpmnFactory.create("dc:Bounds"),
      });
    }

    assign(di.label.bounds, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
  });

  function getVisibleLabelAdjustment(event) {
    let context = event.context,
      connection = context.connection,
      label = connection.label,
      hints = assign({}, context.hints),
      newWaypoints = context.newWaypoints || connection.waypoints,
      oldWaypoints = context.oldWaypoints;

    if (typeof hints.startChanged === "undefined") {
      hints.startChanged = !!hints.connectionStart;
    }

    if (typeof hints.endChanged === "undefined") {
      hints.endChanged = !!hints.connectionEnd;
    }

    return getLabelAdjustment(label, newWaypoints, oldWaypoints, hints);
  }

  this.postExecute(
    ["connection.layout", "connection.updateWaypoints"],
    function (event) {
      let context = event.context,
        hints = context.hints || {};

      if (hints.labelBehavior === false) {
        return;
      }

      let connection = context.connection,
        label = connection.label,
        labelAdjustment;

      // handle missing label as well as the case
      // that the label parent does not exist (yet),
      // because it is being pasted / created via multi element create
      //
      // Cf. https://github.com/bpmn-io/bpmn-js/pull/1227
      if (!label || !label.parent) {
        return;
      }

      labelAdjustment = getVisibleLabelAdjustment(event);

      modeling.moveShape(label, labelAdjustment);
    }
  );

  // keep label position on shape replace
  this.postExecute(["shape.replace"], function (event) {
    let context = event.context,
      newShape = context.newShape,
      oldShape = context.oldShape;

    let businessObject = getBusinessObject(newShape);

    if (
      businessObject &&
      isLabelExternal(businessObject) &&
      oldShape.label &&
      newShape.label
    ) {
      newShape.label.x = oldShape.label.x;
      newShape.label.y = oldShape.label.y;
    }
  });

  // move external label after resizing
  this.postExecute("shape.resize", function (event) {
    let context = event.context,
      shape = context.shape,
      newBounds = context.newBounds,
      oldBounds = context.oldBounds;

    if (hasExternalLabel(shape)) {
      let label = shape.label,
        labelMid = getMid(label),
        edges = asEdges(oldBounds);

      // get nearest border point to label as reference point
      let referencePoint = getReferencePoint(labelMid, edges);

      let delta = getReferencePointDelta(referencePoint, oldBounds, newBounds);

      modeling.moveShape(label, delta);
    }
  });
}

inherits(LabelBehavior, CommandInterceptor);

LabelBehavior.$inject = ["eventBus", "modeling", "bpmnFactory", "textRenderer"];

// helpers //////////////////////

/**
 * Calculates a reference point delta relative to a new position
 * of a certain element's bounds
 *
 * @param {Point} point
 * @param {Bounds} oldBounds
 * @param {Bounds} newBounds
 *
 * @return {Delta} delta
 */
export function getReferencePointDelta(referencePoint, oldBounds, newBounds) {
  let newReferencePoint = getNewAttachPoint(
    referencePoint,
    oldBounds,
    newBounds
  );

  return roundPoint(delta(newReferencePoint, referencePoint));
}

/**
 * Generates the nearest point (reference point) for a given point
 * onto given set of lines
 *
 * @param {Array<Point, Point>} lines
 * @param {Point} point
 *
 * @param {Point}
 */
export function getReferencePoint(point, lines) {
  if (!lines.length) {
    return;
  }

  let nearestLine = getNearestLine(point, lines);

  return perpendicularFoot(point, nearestLine);
}

/**
 * Convert the given bounds to a lines array containing all edges
 *
 * @param {Bounds|Point} bounds
 *
 * @return Array<Point>
 */
export function asEdges(bounds) {
  return [
    [
      // top
      {
        x: bounds.x,
        y: bounds.y,
      },
      {
        x: bounds.x + (bounds.width || 0),
        y: bounds.y,
      },
    ],
    [
      // right
      {
        x: bounds.x + (bounds.width || 0),
        y: bounds.y,
      },
      {
        x: bounds.x + (bounds.width || 0),
        y: bounds.y + (bounds.height || 0),
      },
    ],
    [
      // bottom
      {
        x: bounds.x,
        y: bounds.y + (bounds.height || 0),
      },
      {
        x: bounds.x + (bounds.width || 0),
        y: bounds.y + (bounds.height || 0),
      },
    ],
    [
      // left
      {
        x: bounds.x,
        y: bounds.y,
      },
      {
        x: bounds.x,
        y: bounds.y + (bounds.height || 0),
      },
    ],
  ];
}

/**
 * Returns the nearest line for a given point by distance
 * @param {Point} point
 * @param Array<Point> lines
 *
 * @return Array<Point>
 */
function getNearestLine(point, lines) {
  let distances = lines.map(function (l) {
    return {
      line: l,
      distance: getDistancePointLine(point, l),
    };
  });

  let sorted = sortBy(distances, "distance");

  return sorted[0].line;
}
