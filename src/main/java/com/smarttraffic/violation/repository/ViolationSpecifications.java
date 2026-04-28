package com.smarttraffic.violation.repository;

import com.smarttraffic.violation.entity.Violation;
import org.springframework.data.jpa.domain.Specification;

public final class ViolationSpecifications {

    private ViolationSpecifications() {
    }

    public static Specification<Violation> hasZone(String zone) {
        return (root, query, criteriaBuilder) ->
                zone == null || zone.isBlank()
                        ? criteriaBuilder.conjunction()
                        : criteriaBuilder.equal(criteriaBuilder.lower(root.get("zone")), zone.trim().toLowerCase());
    }

    public static Specification<Violation> speedGreaterThanOrEqual(Integer minSpeed) {
        return (root, query, criteriaBuilder) ->
                minSpeed == null
                        ? criteriaBuilder.conjunction()
                        : criteriaBuilder.greaterThanOrEqualTo(root.get("speed"), minSpeed);
    }

    public static Specification<Violation> speedLessThanOrEqual(Integer maxSpeed) {
        return (root, query, criteriaBuilder) ->
                maxSpeed == null
                        ? criteriaBuilder.conjunction()
                        : criteriaBuilder.lessThanOrEqualTo(root.get("speed"), maxSpeed);
    }
}
