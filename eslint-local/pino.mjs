// Local ESLint rule enforcing pino argument order (object before message).
// Replaces the unmaintained `eslint-plugin-pino` dependency, which is broken
// with ESLint 9+ (its fixer still uses the removed context.getSourceCode() API).

const PINO_METHODS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "child",
  "log",
];

function isPinoLoggerCall(node) {
  if (node.callee.type !== "MemberExpression") {
    return false;
  }
  const memberExpr = node.callee;
  if (memberExpr.property.type !== "Identifier") {
    return false;
  }
  if (!PINO_METHODS.includes(memberExpr.property.name)) {
    return false;
  }
  if (memberExpr.object.type === "Identifier") {
    const objectName = memberExpr.object.name;
    if (objectName === "console" || objectName.endsWith("Console")) {
      return false;
    }
    const lowerName = objectName.toLowerCase();
    return (
      lowerName === "logger" ||
      lowerName === "log" ||
      lowerName === "pino" ||
      lowerName.startsWith("pino") ||
      lowerName.includes("pinolog")
    );
  }
  if (memberExpr.object.type === "MemberExpression") {
    const nestedMember = memberExpr.object;
    if (nestedMember.property.type === "Identifier") {
      const propName = nestedMember.property.name.toLowerCase();
      return propName === "logger" || propName === "log" || propName === "pino";
    }
  }
  return false;
}

function isObjectExpression(node) {
  return node.type === "ObjectExpression";
}

function isStringLike(node) {
  return (
    (node.type === "Literal" && typeof node.value === "string") ||
    node.type === "TemplateLiteral"
  );
}

function hasInterpolationMarkers(node) {
  return (
    node.type === "Literal" &&
    typeof node.value === "string" &&
    /%[sdioO%]/.test(node.value)
  );
}

function isNullish(node) {
  return (
    (node.type === "Literal" && (node.value === null || node.value === undefined)) ||
    (node.type === "Identifier" && node.name === "undefined")
  );
}

const correctArgsPosition = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce correct argument positioning for pino logger methods",
    },
    fixable: "code",
    schema: [],
    messages: {
      incorrectArgsPosition:
        "Pino logger methods should have the object argument before the message string. Use {{method}}({{correctUsage}}) instead.",
    },
  },
  create(context) {
    function generateCorrectUsage(args) {
      const parts = [];
      if (isObjectExpression(args[1])) {
        parts.push("{...}");
      } else {
        parts.push("data");
      }
      parts.push('"message"');
      if (args.length > 2) {
        parts.push("...");
      }
      return parts.join(", ");
    }

    return {
      CallExpression(node) {
        if (!isPinoLoggerCall(node) || node.arguments.length === 0) {
          return;
        }
        const args = node.arguments;
        const methodName = node.callee.property.name;
        const needsReorder =
          args.length >= 2 &&
          isStringLike(args[0]) &&
          !isStringLike(args[1]) &&
          !isNullish(args[1]) &&
          !hasInterpolationMarkers(args[0]);
        if (!needsReorder) {
          return;
        }
        context.report({
          node,
          messageId: "incorrectArgsPosition",
          data: {
            method: methodName,
            correctUsage: generateCorrectUsage(args),
          },
          fix(fixer) {
            const sourceCode = context.sourceCode;
            return [
              fixer.replaceText(args[0], sourceCode.getText(args[1])),
              fixer.replaceText(args[1], sourceCode.getText(args[0])),
            ];
          },
        });
      },
    };
  },
};

export default {
  rules: {
    "correct-args-position": correctArgsPosition,
  },
};