package com.smarttraffic.violation.service;

import com.smarttraffic.violation.dto.StatsResponse;
import com.smarttraffic.violation.dto.TrafficCheckRequest;
import com.smarttraffic.violation.dto.TrafficCheckResponse;
import com.smarttraffic.violation.dto.ViolationResponse;
import com.smarttraffic.violation.dto.ViolationUpdateRequest;
import com.smarttraffic.violation.entity.Violation;
import com.smarttraffic.violation.exception.InvalidRequestException;
import com.smarttraffic.violation.exception.ResourceNotFoundException;
import com.smarttraffic.violation.repository.ViolationRepository;
import com.smarttraffic.violation.repository.ViolationSpecifications;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class ViolationServiceImpl implements ViolationService {

    private static final int SPEED_LIMIT = 80;
    private static final String DEFAULT_SORT_FIELD = "createdAt";

    private final ViolationRepository violationRepository;

    @Override
    public TrafficCheckResponse checkTrafficViolation(TrafficCheckRequest request) {
        boolean violationDetected = request.getSpeed() > SPEED_LIMIT && !Boolean.TRUE.equals(request.getIsEmergency());

        if (!violationDetected) {
            return TrafficCheckResponse.builder()
                    .violationDetected(false)
                    .message("No violation detected")
                    .fine(0)
                    .violation(null)
                    .build();
        }

        int fine = calculateFine(request.getSpeed());
        Violation violation = Violation.builder()
                .vehicleId(request.getVehicleId().trim())
                .speed(request.getSpeed())
                .zone(request.getZone().trim())
                .fine(fine)
                .isEmergency(request.getIsEmergency())
                .build();

        Violation savedViolation = violationRepository.save(violation);
        log.info("Violation recorded for vehicleId={}, zone={}, speed={}, fine={}",
                savedViolation.getVehicleId(), savedViolation.getZone(), savedViolation.getSpeed(), savedViolation.getFine());

        return TrafficCheckResponse.builder()
                .violationDetected(true)
                .message("Violation detected and saved successfully")
                .fine(fine)
                .violation(mapToResponse(savedViolation))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ViolationResponse> getAllViolations(int page, int size, String sortBy, String order) {
        Pageable pageable = buildPageable(page, size, sortBy, order);
        return violationRepository.findAll(pageable).map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public ViolationResponse getViolationById(Long id) {
        return mapToResponse(findViolation(id));
    }

    @Override
    public ViolationResponse updateViolation(Long id, ViolationUpdateRequest request) {
        Violation violation = findViolation(id);
        violation.setVehicleId(request.getVehicleId().trim());
        violation.setSpeed(request.getSpeed());
        violation.setZone(request.getZone().trim());
        violation.setIsEmergency(request.getIsEmergency());
        violation.setFine(recalculateFine(request.getSpeed(), request.getIsEmergency()));

        Violation updatedViolation = violationRepository.save(violation);
        log.info("Violation updated for id={}, vehicleId={}, fine={}",
                updatedViolation.getId(), updatedViolation.getVehicleId(), updatedViolation.getFine());

        return mapToResponse(updatedViolation);
    }

    @Override
    public void deleteViolation(Long id) {
        Violation violation = findViolation(id);
        violationRepository.delete(violation);
        log.info("Violation deleted for id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ViolationResponse> filterViolations(String zone, Integer minSpeed, Integer maxSpeed, int page, int size,
                                                    String sortBy, String order) {
        if (minSpeed != null && maxSpeed != null && minSpeed > maxSpeed) {
            throw new InvalidRequestException("minSpeed cannot be greater than maxSpeed");
        }

        Specification<Violation> specification = Specification
                .where(ViolationSpecifications.hasZone(zone))
                .and(ViolationSpecifications.speedGreaterThanOrEqual(minSpeed))
                .and(ViolationSpecifications.speedLessThanOrEqual(maxSpeed));

        Pageable pageable = buildPageable(page, size, sortBy, order);
        return violationRepository.findAll(specification, pageable).map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public StatsResponse getViolationStats() {
        Map<String, Long> violationsPerZone = new LinkedHashMap<>();
        for (Object[] row : violationRepository.countViolationsByZone()) {
            violationsPerZone.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }

        return StatsResponse.builder()
                .totalViolations(violationRepository.count())
                .totalFineCollected(violationRepository.sumAllFines())
                .violationsPerZone(violationsPerZone)
                .build();
    }

    private Violation findViolation(Long id) {
        return violationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Violation not found with id: " + id));
    }

    private Pageable buildPageable(int page, int size, String sortBy, String order) {
        String resolvedSortBy = (sortBy == null || sortBy.isBlank()) ? DEFAULT_SORT_FIELD : sortBy;
        Sort.Direction direction = "desc".equalsIgnoreCase(order) ? Sort.Direction.DESC : Sort.Direction.ASC;
        return PageRequest.of(page, size, Sort.by(direction, resolvedSortBy));
    }

    private int recalculateFine(int speed, boolean isEmergency) {
        if (speed <= SPEED_LIMIT || isEmergency) {
            return 0;
        }
        return calculateFine(speed);
    }

    private int calculateFine(int speed) {
        if (speed > 120) {
            return 5000;
        }
        if (speed > 100) {
            return 2000;
        }
        return 1000;
    }

    private ViolationResponse mapToResponse(Violation violation) {
        return ViolationResponse.builder()
                .id(violation.getId())
                .vehicleId(violation.getVehicleId())
                .speed(violation.getSpeed())
                .zone(violation.getZone())
                .fine(violation.getFine())
                .isEmergency(violation.getIsEmergency())
                .createdAt(violation.getCreatedAt())
                .build();
    }
}
