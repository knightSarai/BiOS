import z from "zod"

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined
          ? "This field is required"
          : `Expected ${issue.expected}`
      case "too_small":
        if (issue.origin === "string") {
          return issue.minimum === 1
            ? "This field is required"
            : `Must be at least ${issue.minimum} character(s)`
        }
        return issue.inclusive
          ? `Must be at least ${issue.minimum}`
          : `Must be greater than ${issue.minimum}`
      case "too_big":
        return issue.origin === "string"
          ? `Must be at most ${issue.maximum} character(s)`
          : issue.inclusive
            ? `Must be at most ${issue.maximum}`
            : `Must be less than ${issue.maximum}`
      case "invalid_format":
        return "Invalid format"
      case "invalid_value":
        return "Invalid value"
    }
  },
})
