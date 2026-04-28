package com.smarttraffic.violation.service;

import com.smarttraffic.violation.dto.StatsResponse;
import com.smarttraffic.violation.dto.TrafficCheckRequest;
import com.smarttraffic.violation.dto.TrafficCheckResponse;
import com.smarttraffic.violation.dto.ViolationResponse;
import com.smarttraffic.violation.dto.ViolationUpdateRequest;
import com.smarttraffic.violation.dto.RecordStatus;
import org.springframework.data.domain.Page;

public interface ViolationService {

    TrafficCheckResponse checkTrafficViolation(TrafficCheckRequest request);

    Page<ViolationResponse> getAllViolations(int page, int size, String sortBy, String order);

    ViolationResponse getViolationById(Long id);

    ViolationResponse updateViolation(Long id, ViolationUpdateRequest request);

    void deleteViolation(Long id);

    Page<ViolationResponse> filterViolations(String zone, Integer minSpeed, Integer maxSpeed, RecordStatus status, int page, int size,
                                             String sortBy, String order);

    StatsResponse getViolationStats();
}
